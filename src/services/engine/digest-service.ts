import type { EventStore } from '../../events/event-store.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../observability/logger.js';
import { getTraceId } from '../../observability/trace.js';
import type { DomainEvent } from '../../events/types.js';
import { EVENT_TYPES } from '../../events/types.js';
import type { ServiceDeps } from '../deps.js';
import {
  ensureDoubleNewlinesIfMultiline,
  lowercaseFirstLetterAfterColonPerLine,
  stripTrailingDotsPerLine,
} from '../../domain/text-format.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../week-service.js';
import { InvariantViolationError } from '../../domain/errors.js';
import type { EngineMode } from '../../services/product-mode.js';
import { getModeConfig } from '../../modes/registry.js';
import { areaLabel } from '../../modes/shared.js';
import { resolveEnginePrompt } from './prompt-resolver.js';

export function createEngineDigestService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function generateDigest(userId: string, mode: EngineMode, idempotencyKey: string): Promise<{ weekId: string; rawPost: string }> {
    const config = getModeConfig(mode);
    const userDateStr = await getUserLocalDate(userId, pool);
    const weekId = getWeekId(userDateStr);
    const { start, end } = getWeekStartEnd(userDateStr);

    const commitmentRow = await pool.query<{
      title: string;
      area_key: string | null;
      area_custom: string | null;
      answers: Record<string, string>;
    }>(
      `SELECT title, area_key, area_custom, answers FROM engine_commitments
       WHERE user_id = $1 AND mode = $2 AND week_id = $3`,
      [userId, mode, weekId]
    );
    if (commitmentRow.rows.length === 0) {
      throw new InvariantViolationError(config.digest.needFocusHint, 'NOT_FOUND');
    }
    const c = commitmentRow.rows[0]!;
    const commitment = {
      title: c.title,
      area: c.area_key ? areaLabel(config.commitment.areas, c.area_key, c.area_custom) : null,
      answers: c.answers,
    };

    const stepsRow = await pool.query<{ day: string; movement_branch: string; answers: Record<string, string> }>(
      `SELECT day, movement_branch, answers FROM engine_steps
       WHERE user_id = $1 AND mode = $2 AND date >= $3 AND date <= $4
       ORDER BY date`,
      [userId, mode, start, end]
    );
    if (stepsRow.rows.length === 0) {
      throw new InvariantViolationError(config.digest.needLogsHint, 'NO_STEPS');
    }

    const switchRow = await pool.query<{ answers: Record<string, string>; created_at: string }>(
      `SELECT answers, created_at FROM engine_switches WHERE user_id = $1 AND mode = $2 AND week_id = $3 LIMIT 1`,
      [userId, mode, weekId]
    );

    const input = {
      mode: config.label,
      weekly_commitment: commitment,
      daily_steps: stepsRow.rows,
      pivot: switchRow.rows[0] ?? null,
    };
    const userMessage = JSON.stringify(input, null, 2);

    let rawPost = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptKey = attempt === 0 ? idempotencyKey : `${idempotencyKey}:retry_${attempt}`;
      const msg =
        attempt === 0
          ? userMessage
          : `${userMessage}\n\nВерни только итоговый текст карточки, без markdown и комментариев.`;
      const response = await llm.complete(resolveEnginePrompt(config.digest.llmPromptKey), msg, {
        idempotencyKey: attemptKey,
        userId,
        traceId: getTraceId(),
        callType: 'digest',
      });
      rawPost = ensureDoubleNewlinesIfMultiline(
        lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine((response.content ?? '').trim()))
      );
      if (rawPost.length > 0) break;
      logger.warn({ userId, mode, attempt }, 'Engine digest LLM empty');
    }
    if (!rawPost) throw new InvariantViolationError('Recap: не удалось получить текст', 'SERVICE_ERROR');
    return { weekId, rawPost };
  }

  return {
    async createDigest(userId: string, mode: EngineMode): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      const idempotencyKey = `engine_digest:${mode}:${userId}:${weekId}`;
      const { weekId: resolvedWeekId, rawPost } = await generateDigest(userId, mode, idempotencyKey);

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.DigestSet,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'EngineDigest', id: `${userId}:${mode}:${resolvedWeekId}` },
        payload: { user_id: userId, mode, week_id: resolvedWeekId, raw_post: rawPost, source: 'initial' },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };
      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);
      return rawPost;
    },

    async updateDigestManual(userId: string, mode: EngineMode): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      const idempotencyKey = `engine_digest:${mode}:${userId}:${weekId}:manual:${randomUUID()}`;
      const { rawPost } = await generateDigest(userId, mode, idempotencyKey);

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.DigestSet,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'EngineDigest', id: `${userId}:${mode}:${weekId}` },
        payload: { user_id: userId, mode, week_id: weekId, raw_post: rawPost, source: 'manual' },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };
      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);
      return rawPost;
    },
  };
}
