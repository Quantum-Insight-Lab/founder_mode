import type { EventStore } from '../events/event-store.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../observability/logger.js';
import { getTraceId } from '../observability/trace.js';
import type { DomainEvent } from '../events/types.js';
import { EVENT_TYPES } from '../events/types.js';
import { prompts } from '../llm/prompts.js';
import type { ServiceDeps } from './deps.js';
import {
  ensureDoubleNewlinesIfMultiline,
  lowercaseFirstLetterAfterColonPerLine,
  stripTrailingDotsPerLine,
} from '../domain/text-format.js';
import { getUserLocalDate } from '../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from './week-service.js';
import { InvariantViolationError } from '../domain/errors.js';

interface GeneratedReport {
  weekId: string;
  renderedCard: string;
}

export function createReportService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function generateReportFromData(userId: string, idempotencyKey: string): Promise<GeneratedReport> {
    const userDateStr = await getUserLocalDate(userId, pool);
    const weekId = getWeekId(userDateStr);
    const { start, end } = getWeekStartEnd(userDateStr);
    logger.debug({ userId, weekId, start, end }, 'generateReportFromData');

    const declarationRow = await pool.query<{
      main_focus: string;
      win_result: string;
      week_failure: string;
    }>(
      `SELECT main_focus, win_result, week_failure
       FROM weekly_declarations
       WHERE user_id = $1 AND week_id = $2`,
      [userId, weekId]
    );
    const declaration = declarationRow.rows[0];
    if (!declaration) {
      throw new InvariantViolationError('Нужна declaration недели для Report', 'NOT_FOUND');
    }

    const reflectionsRow = await pool.query<{
      day: string;
      had_movement: boolean;
      movement_branch: string | null;
      what_moved: string | null;
      tomorrow_step: string | null;
      what_stopped: string | null;
      attention_sink: string | null;
      why_partial: string | null;
      new_focus: string | null;
    }>(
      `SELECT day, had_movement, movement_branch, what_moved, tomorrow_step, what_stopped,
              attention_sink, why_partial, new_focus
       FROM daily_fixations
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date`,
      [userId, start, end]
    );

    const priorityChangeRow = await pool.query<{
      reason: string;
      new_focus: string;
      new_win: string;
      new_failure: string;
      raw_post: string;
      created_at: string;
    }>(
      `SELECT reason, new_focus, new_win, new_failure, raw_post, created_at
       FROM weekly_priority_changes
       WHERE user_id = $1 AND week_id = $2
       LIMIT 1`,
      [userId, weekId]
    );

    if (reflectionsRow.rows.length === 0) {
      throw new InvariantViolationError(
        'Сначала нужно зафиксировать хотя бы одну фиксацию недели. Напиши (нажми) /fixation',
        'NO_FIXATIONS'
      );
    }

    const input = {
      WEEKLY_DECLARATION: declaration,
      daily_fixations: reflectionsRow.rows,
      priority_change: priorityChangeRow.rows[0] ?? null,
    };
    const userMessage = JSON.stringify(input, null, 2);

    const basePrompt = prompts.weeklyReport();
    let renderedCard = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptIdempotencyKey = attempt === 0 ? idempotencyKey : `${idempotencyKey}:retry_text_${attempt}`;
      const attemptUserMessage =
        attempt === 0
          ? userMessage
          : `${userMessage}\n\nВерни только итоговый текст карточки, без markdown и комментариев.`;
      const response = await llm.complete(basePrompt, attemptUserMessage, {
        idempotencyKey: attemptIdempotencyKey,
        userId,
        traceId: getTraceId(),
        callType: 'report',
      });
      renderedCard = ensureDoubleNewlinesIfMultiline(
        lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine((response.content ?? '').trim()))
      );
      if (renderedCard.length > 0) break;
      logger.warn({ userId, weekId, attempt }, 'Report text response is empty');
    }

    if (!renderedCard) {
      throw new InvariantViolationError('Report: не удалось получить текст карточки', 'SERVICE_ERROR');
    }
    return { weekId, renderedCard };
  }

  return {
    async createReport(userId: string): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      const idempotencyKey = `report:${userId}:${weekId}`;
      const { weekId: resolvedWeekId, renderedCard } = await generateReportFromData(userId, idempotencyKey);

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.ReportCreated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyReport', id: `${userId}:${resolvedWeekId}` },
        payload: {
          user_id: userId,
          week_id: resolvedWeekId,
          raw_post: renderedCard,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };

      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);
      return renderedCard;
    },

    async updateReportManual(userId: string): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      logger.debug({ userId, weekId }, 'updateReportManual');
      const idempotencyKey = `report:${userId}:${weekId}:manual:${randomUUID()}`;
      const { renderedCard } = await generateReportFromData(userId, idempotencyKey);
      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.ReportUpdated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyReport', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          raw_post: renderedCard,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };
      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);
      return renderedCard;
    },
  };
}
