import type { EventStore } from '../../events/event-store.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../observability/logger.js';
import { getTraceId } from '../../observability/trace.js';
import type { DomainEvent } from '../../events/types.js';
import { EVENT_TYPES } from '../../events/types.js';
import type { ServiceDeps } from '../deps.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../week-service.js';
import {
  ensureDoubleNewlinesIfMultiline,
  lowercaseFirstLetterAfterColonPerLine,
  stripTrailingDotsPerLine,
} from '../../domain/text-format.js';
import { InvariantViolationError } from '../../domain/errors.js';
import type { EngineMode } from '../../services/product-mode.js';
import type { ModeConfig } from '../../modes/types.js';
import { getModeConfig } from '../../modes/registry.js';
import { buildCommitmentUserMessage } from './message-builders.js';
import { resolveEnginePrompt } from './prompt-resolver.js';

export interface CommitmentInput {
  title: string;
  area_key?: string | null;
  area_custom?: string | null;
  answers: Record<string, string>;
}

async function generateRawPost(
  llm: ServiceDeps['llm'],
  promptKey: ModeConfig['commitment']['llmPromptKey'],
  userMessage: string,
  userId: string,
  idempotencyKey: string,
  logLabel: string
): Promise<string> {
  let rawPost = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptKey = attempt === 0 ? idempotencyKey : `${idempotencyKey}:retry_${attempt}`;
    const msg =
      attempt === 0
        ? userMessage
        : `${userMessage}\n\nВерни только итоговый текст карточки, без markdown и комментариев.`;
    const response = await llm.complete(resolveEnginePrompt(promptKey), msg, {
      idempotencyKey: attemptKey,
      userId,
      traceId: getTraceId(),
      callType: 'matter',
    });
    rawPost = ensureDoubleNewlinesIfMultiline(
      lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine((response.content ?? '').trim()))
    );
    if (rawPost.length > 0) break;
    logger.warn({ userId, attempt, logLabel }, 'Engine LLM response empty');
  }
  if (!rawPost) throw new Error(`${logLabel}: не удалось получить текст карточки`);
  return rawPost;
}

export function createEngineCommitmentService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  return {
    async createCommitment(userId: string, mode: EngineMode, input: CommitmentInput): Promise<string> {
      const config = getModeConfig(mode);
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      const idempotencyKey = `engine_commitment:${mode}:${userId}:${weekId}`;
      const userMessage = buildCommitmentUserMessage(
        config,
        input.title,
        input.area_key ?? null,
        input.area_custom ?? null,
        input.answers
      );
      const rawPost = await generateRawPost(llm, config.commitment.llmPromptKey, userMessage, userId, idempotencyKey, 'Commitment');

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.CommitmentSet,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'EngineCommitment', id: `${userId}:${mode}:${weekId}` },
        payload: {
          user_id: userId,
          mode,
          week_id: weekId,
          title: input.title.trim(),
          area_key: input.area_key ?? null,
          area_custom: input.area_custom ?? null,
          answers: input.answers,
          raw_post: rawPost,
          source: 'initial',
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };
      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);
      return rawPost;
    },

    async updateCommitmentManual(userId: string, mode: EngineMode, input: CommitmentInput): Promise<string> {
      const config = getModeConfig(mode);
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      const { start, end } = getWeekStartEnd(userDateStr);
      const stepCount = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM engine_steps
         WHERE user_id = $1 AND mode = $2 AND date >= $3 AND date <= $4`,
        [userId, mode, start, end]
      );
      if ((stepCount.rows[0]?.c ?? 0) > 0) {
        throw new InvariantViolationError(config.commitment.lockHint, 'COMMITMENT_LOCKED');
      }

      const idempotencyKey = `engine_commitment:${mode}:${userId}:${weekId}:manual:${randomUUID()}`;
      const userMessage = buildCommitmentUserMessage(
        config,
        input.title,
        input.area_key ?? null,
        input.area_custom ?? null,
        input.answers
      );
      const rawPost = await generateRawPost(llm, config.commitment.llmPromptKey, userMessage, userId, idempotencyKey, 'Commitment');

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.CommitmentSet,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'EngineCommitment', id: `${userId}:${mode}:${weekId}` },
        payload: {
          user_id: userId,
          mode,
          week_id: weekId,
          title: input.title.trim(),
          area_key: input.area_key ?? null,
          area_custom: input.area_custom ?? null,
          answers: input.answers,
          raw_post: rawPost,
          source: 'manual',
        },
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
