import type { EventStore } from '../events/event-store.js';
import { logger } from '../observability/logger.js';
import { getTraceId } from '../observability/trace.js';
import type { DomainEvent } from '../events/types.js';
import { EVENT_TYPES } from '../events/types.js';
import { randomUUID } from 'node:crypto';
import { prompts } from '../llm/prompts.js';
import type { ServiceDeps } from './deps.js';
import { getUserLocalDate } from '../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from './week-service.js';
import {
  ensureDoubleNewlinesIfMultiline,
  lowercaseFirstLetterAfterColonPerLine,
  stripTrailingDotsPerLine,
} from '../domain/text-format.js';
import { InvariantViolationError } from '../domain/errors.js';

interface PriorityChangeAnswers {
  reason: string;
  new_focus: string;
  new_win: string;
  new_failure: string;
}

interface PriorityChangeStructured {
  reason: string;
  new_focus: string;
  new_win: string;
  new_failure: string;
}

export function createPriorityChangeService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function ensureNoFixationsAfterChange(userId: string, weekId: string): Promise<void> {
    const change = await pool.query<{ created_at: string }>(
      'SELECT created_at FROM weekly_priority_changes WHERE user_id = $1 AND week_id = $2 LIMIT 1',
      [userId, weekId]
    );
    const createdAt = change.rows[0]?.created_at;
    if (!createdAt) return;
    // weekId is the Monday YMD (YYYYMMDD). Convert to a Y-M-D so we can reuse week utility.
    const mondayYmd = `${weekId.slice(0, 4)}-${weekId.slice(4, 6)}-${weekId.slice(6, 8)}`;
    const { start, end } = getWeekStartEnd(mondayYmd);
    const fix = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c
       FROM daily_fixations
       WHERE user_id = $1
         AND date >= $2
         AND date <= $3
         AND created_at > $4::timestamptz`,
      [userId, start, end, createdAt]
    );
    if ((fix.rows[0]?.c ?? 0) > 0) {
      throw new InvariantViolationError(
        '⚠️ После смены приоритета уже были фиксации. Приоритет менять нельзя — он задаёт контекст для уже записанных дней.',
        'PRIORITY_CHANGE_LOCKED'
      );
    }
  }

  async function generateChangeCardText(userId: string, weekId: string, answers: PriorityChangeAnswers, idempotencyKey: string) {
    const userMessage = [
      `reason: ${answers.reason}`,
      `new_focus: ${answers.new_focus}`,
      `new_win: ${answers.new_win}`,
      `new_failure: ${answers.new_failure}`,
    ].join('\n');
    const response = await llm.complete(prompts.priorityChange(), userMessage, {
      idempotencyKey,
      userId,
      traceId: getTraceId(),
      callType: 'change',
    });
    const rawPost = ensureDoubleNewlinesIfMultiline(
      lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine((response.content ?? '').trim()))
    );
    if (!rawPost) {
      throw new InvariantViolationError('Смена приоритета: не удалось получить текст карточки', 'SERVICE_ERROR');
    }
    return rawPost;
  }

  return {
    async createPriorityChange(
      userId: string,
      answers: PriorityChangeAnswers
    ): Promise<{ rawPost: string; structured: PriorityChangeStructured }> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      logger.debug({ userId, weekId }, 'createPriorityChange');

      const declaration = await pool.query(
        'SELECT 1 FROM weekly_declarations WHERE user_id = $1 AND week_id = $2 LIMIT 1',
        [userId, weekId]
      );
      if (declaration.rows.length === 0) {
        throw new InvariantViolationError('Сначала нужно зафиксировать declaration недели. Напиши (нажми) /declaration', 'NOT_FOUND');
      }

      const existing = await pool.query(
        'SELECT 1 FROM weekly_priority_changes WHERE user_id = $1 AND week_id = $2 LIMIT 1',
        [userId, weekId]
      );
      if (existing.rows.length > 0) {
        throw new InvariantViolationError(
          '⚠️ Смена приоритета на эту неделю уже есть.',
          'PRIORITY_CHANGE_LIMIT'
        );
      }

      const idempotencyKey = `priority_change:${userId}:${weekId}`;
      const rawPost = await generateChangeCardText(userId, weekId, answers, idempotencyKey);

      const structured: PriorityChangeStructured = {
        reason: answers.reason.trim(),
        new_focus: answers.new_focus.trim(),
        new_win: answers.new_win.trim(),
        new_failure: answers.new_failure.trim(),
      };

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.PriorityChanged,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyPriorityChange', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          reason: structured.reason,
          new_focus: structured.new_focus,
          new_win: structured.new_win,
          new_failure: structured.new_failure,
          raw_post: rawPost,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };

      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);

      return { rawPost, structured };
    },

    async updatePriorityChangeManual(
      userId: string,
      answers: PriorityChangeAnswers
    ): Promise<{ rawPost: string; structured: PriorityChangeStructured }> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      logger.debug({ userId, weekId }, 'updatePriorityChangeManual');

      const existing = await pool.query(
        'SELECT 1 FROM weekly_priority_changes WHERE user_id = $1 AND week_id = $2 LIMIT 1',
        [userId, weekId]
      );
      if (existing.rows.length === 0) {
        throw new InvariantViolationError('Смена приоритета на эту неделю ещё не задана. Напиши (нажми) /change', 'NOT_FOUND');
      }

      await ensureNoFixationsAfterChange(userId, weekId);

      const idempotencyKey = `priority_change:${userId}:${weekId}:manual:${randomUUID()}`;
      const rawPost = await generateChangeCardText(userId, weekId, answers, idempotencyKey);

      const structured: PriorityChangeStructured = {
        reason: answers.reason.trim(),
        new_focus: answers.new_focus.trim(),
        new_win: answers.new_win.trim(),
        new_failure: answers.new_failure.trim(),
      };

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.PriorityChanged,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyPriorityChange', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          reason: structured.reason,
          new_focus: structured.new_focus,
          new_win: structured.new_win,
          new_failure: structured.new_failure,
          raw_post: rawPost,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };

      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);

      return { rawPost, structured };
    },
  };
}
