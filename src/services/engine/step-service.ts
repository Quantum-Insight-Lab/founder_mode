import type { EventStore } from '../../events/event-store.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../observability/logger.js';
import { getTraceId } from '../../observability/trace.js';
import type { DomainEvent, EngineStepMovementBranch } from '../../events/types.js';
import { EVENT_TYPES } from '../../events/types.js';
import { validateFixationDate } from '../../domain/validators.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { formatDayFull } from '../../domain/date-format.js';
import {
  ensureDoubleNewlinesIfMultiline,
  lowercaseFirstLetterAfterColonPerLine,
  stripTrailingDotsPerLine,
} from '../../domain/text-format.js';
import { getWeekId } from '../week-service.js';
import { InvariantViolationError } from '../../domain/errors.js';
import type { ServiceDeps } from '../deps.js';
import type { EngineMode } from '../../services/product-mode.js';
import { getModeConfig } from '../../modes/registry.js';
import { buildDailyUserMessage, validateEngineStepAnswers } from './message-builders.js';
import { resolveEnginePrompt } from './prompt-resolver.js';

export function createEngineStepService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function submitStepBase(
    userId: string,
    mode: EngineMode,
    data: { date: string; movement_branch: EngineStepMovementBranch; answers: Record<string, string> },
    idempotencyKeyOverride?: string,
    skipDateValidation = false,
    source: 'initial' | 'manual' = 'initial'
  ): Promise<string> {
    const config = getModeConfig(mode);
    validateEngineStepAnswers(data.movement_branch, data.answers, config);
    const todayStr = await getUserLocalDate(userId, pool);
    if (!skipDateValidation) validateFixationDate(data.date, todayStr);

    const weekId = getWeekId(data.date);
    const hasCommitment = await pool.query(
      'SELECT 1 FROM engine_commitments WHERE user_id = $1 AND mode = $2 AND week_id = $3 LIMIT 1',
      [userId, mode, weekId]
    );
    if (hasCommitment.rows.length === 0) {
      const todayWeekId = getWeekId(todayStr);
      const fallback = await pool.query(
        'SELECT 1 FROM engine_commitments WHERE user_id = $1 AND mode = $2 AND week_id = $3 LIMIT 1',
        [userId, mode, todayWeekId]
      );
      if (fallback.rows.length === 0) {
        throw new InvariantViolationError(config.daily.needFocusHint, 'NOT_FOUND');
      }
    }

    const date = new Date(data.date + 'T12:00:00Z');
    const day = formatDayFull(date.getUTCDay());
    const userMessage = buildDailyUserMessage(config, data.movement_branch, data.answers);
    const idempotencyKey = idempotencyKeyOverride ?? `engine_step:${mode}:${userId}:${data.date}`;

    const response = await llm.complete(resolveEnginePrompt(config.daily.llmPromptKey), userMessage, {
      idempotencyKey,
      userId,
      traceId: getTraceId(),
      callType: 'step',
    });
    const rawPost = ensureDoubleNewlinesIfMultiline(
      lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine((response.content ?? '').trim()))
    );
    if (!rawPost) {
      logger.warn({ userId, mode, date: data.date }, 'Engine step LLM empty');
      throw new Error('Step: не удалось получить текст карточки');
    }

    const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
      event_type: EVENT_TYPES.DailyStepSubmitted,
      actor: { id: userId, role: 'user' },
      subject: { entity: 'EngineStep', id: `${userId}:${mode}:${data.date}` },
      payload: {
        user_id: userId,
        mode,
        date: data.date,
        day,
        movement_branch: data.movement_branch,
        answers: data.answers,
        raw_post: rawPost,
        source,
      },
      causation_id: null,
      correlation_id: null,
      idempotency_key: idempotencyKey,
      schema_version: 1,
    };
    const appended = await eventStore.append(event);
    await projectors.handleEvent(appended);
    return rawPost;
  }

  return {
    submitStep(
      userId: string,
      mode: EngineMode,
      data: { date: string; movement_branch: EngineStepMovementBranch; answers: Record<string, string> }
    ) {
      return submitStepBase(userId, mode, data);
    },
    updateStepManual(
      userId: string,
      mode: EngineMode,
      data: { date: string; movement_branch: EngineStepMovementBranch; answers: Record<string, string> }
    ) {
      return submitStepBase(
        userId,
        mode,
        data,
        `engine_step:${mode}:${userId}:${data.date}:manual:${randomUUID()}`,
        true,
        'manual'
      );
    },
  };
}
