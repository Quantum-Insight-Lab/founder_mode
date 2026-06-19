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
import { matterAreaLabel } from '../bot/closure-conversations.js';

interface GeneratedDigest {
  weekId: string;
  renderedCard: string;
}

export function createDigestService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function generateDigestFromData(userId: string, idempotencyKey: string): Promise<GeneratedDigest> {
    const userDateStr = await getUserLocalDate(userId, pool);
    const weekId = getWeekId(userDateStr);
    const { start, end } = getWeekStartEnd(userDateStr);
    logger.debug({ userId, weekId, start, end }, 'generateDigestFromData');

    const matterRow = await pool.query<{
      title: string;
      area_key: string;
      area_custom: string | null;
      why_postponed: string;
      cost_of_inaction: string;
      week_target: string;
    }>(
      `SELECT title, area_key, area_custom, why_postponed, cost_of_inaction, week_target
       FROM weekly_matters
       WHERE user_id = $1 AND week_id = $2`,
      [userId, weekId]
    );
    const matterRowData = matterRow.rows[0];
    if (!matterRowData) {
      throw new InvariantViolationError('Нужно дело недели для дайджеста. Напиши /matter', 'NOT_FOUND');
    }
    const matter = {
      ...matterRowData,
      area: matterAreaLabel(matterRowData.area_key, matterRowData.area_custom),
    };

    const stepsRow = await pool.query<{
      day: string;
      had_movement: boolean;
      movement_branch: string | null;
      what_moved: string | null;
      tomorrow_step: string | null;
      what_stopped: string | null;
      avoidance: string | null;
      why_partial: string | null;
    }>(
      `SELECT day, had_movement, movement_branch, what_moved, tomorrow_step, what_stopped,
              avoidance, why_partial
       FROM matter_steps
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date`,
      [userId, start, end]
    );

    const switchRow = await pool.query<{
      reason: string;
      new_title: string;
      new_target: string;
      created_at: string;
    }>(
      `SELECT reason, new_title, new_target, created_at
       FROM matter_switches
       WHERE user_id = $1 AND week_id = $2
       LIMIT 1`,
      [userId, weekId]
    );

    if (stepsRow.rows.length === 0) {
      throw new InvariantViolationError(
        'Сначала отметь хотя бы один шаг недели. Напиши /step',
        'NO_STEPS'
      );
    }

    const input = {
      weekly_matter: matter,
      matter_steps: stepsRow.rows,
      matter_switch: switchRow.rows[0] ?? null,
    };
    const userMessage = JSON.stringify(input, null, 2);

    let renderedCard = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptIdempotencyKey = attempt === 0 ? idempotencyKey : `${idempotencyKey}:retry_text_${attempt}`;
      const attemptUserMessage =
        attempt === 0
          ? userMessage
          : `${userMessage}\n\nВерни только итоговый текст карточки, без markdown и комментариев.`;
      const response = await llm.complete(prompts.digest(), attemptUserMessage, {
        idempotencyKey: attemptIdempotencyKey,
        userId,
        traceId: getTraceId(),
        callType: 'digest',
      });
      renderedCard = ensureDoubleNewlinesIfMultiline(
        lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine((response.content ?? '').trim()))
      );
      if (renderedCard.length > 0) break;
      logger.warn({ userId, weekId, attempt }, 'Digest text response is empty');
    }

    if (!renderedCard) {
      throw new InvariantViolationError('Digest: не удалось получить текст карточки', 'SERVICE_ERROR');
    }
    return { weekId, renderedCard };
  }

  return {
    async createDigest(userId: string): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      const idempotencyKey = `digest:${userId}:${weekId}`;
      const { weekId: resolvedWeekId, renderedCard } = await generateDigestFromData(userId, idempotencyKey);

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.MatterDigestSet,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyDigest', id: `${userId}:${resolvedWeekId}` },
        payload: {
          user_id: userId,
          week_id: resolvedWeekId,
          raw_post: renderedCard,
          source: 'initial',
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

    async updateDigestManual(userId: string): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      logger.debug({ userId, weekId }, 'updateDigestManual');
      const idempotencyKey = `digest:${userId}:${weekId}:manual:${randomUUID()}`;
      const { renderedCard } = await generateDigestFromData(userId, idempotencyKey);
      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.MatterDigestSet,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyDigest', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          raw_post: renderedCard,
          source: 'manual',
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
