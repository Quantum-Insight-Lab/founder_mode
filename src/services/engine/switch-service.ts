import type { EventStore } from '../../events/event-store.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../observability/logger.js';
import { getTraceId } from '../../observability/trace.js';
import type { DomainEvent } from '../../events/types.js';
import { EVENT_TYPES } from '../../events/types.js';
import type { ServiceDeps } from '../deps.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { getWeekId } from '../week-service.js';
import {
  ensureDoubleNewlinesIfMultiline,
  lowercaseFirstLetterAfterColonPerLine,
  stripTrailingDotsPerLine,
} from '../../domain/text-format.js';
import type { EngineMode } from '../../services/product-mode.js';
import { getModeConfig } from '../../modes/registry.js';
import { buildSwitchUserMessage } from './message-builders.js';
import { resolveEnginePrompt } from './prompt-resolver.js';

export function createEngineSwitchService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  return {
    async createSwitch(userId: string, mode: EngineMode, answers: Record<string, string>): Promise<string> {
      const config = getModeConfig(mode);
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      const idempotencyKey = `engine_switch:${mode}:${userId}:${weekId}:${randomUUID()}`;
      const userMessage = buildSwitchUserMessage(config, answers);

      const response = await llm.complete(resolveEnginePrompt(config.switchFlow.llmPromptKey), userMessage, {
        idempotencyKey,
        userId,
        traceId: getTraceId(),
        callType: 'switch',
      });
      const rawPost = ensureDoubleNewlinesIfMultiline(
        lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine((response.content ?? '').trim()))
      );
      if (!rawPost) {
        logger.warn({ userId, mode }, 'Engine switch LLM empty');
        throw new Error('Switch: не удалось получить текст карточки');
      }

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.CommitmentSwitched,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'EngineSwitch', id: `${userId}:${mode}:${weekId}` },
        payload: {
          user_id: userId,
          mode,
          week_id: weekId,
          answers,
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
  };
}
