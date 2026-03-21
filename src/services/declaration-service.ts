import type { EventStore } from '../events/event-store.js';
import { logger } from '../observability/logger.js';
import { getTraceId } from '../observability/trace.js';
import type { DomainEvent } from '../events/types.js';
import { EVENT_TYPES } from '../events/types.js';
import { prompts } from '../llm/prompts.js';
import type { ServiceDeps } from './deps.js';
import { dateStrToWeekRef } from '../domain/timezone.js';
import { formatDayFull } from '../domain/date-format.js';
import { getUserLocalDate } from '../db/user-timezone.js';
import { getWeekId } from './plan-service.js';

interface DeclarationAnswers {
  main_focus: string;
  win_result: string;
  week_failure: string;
}

export function createDeclarationService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  return {
    async createDeclaration(userId: string, answers: DeclarationAnswers): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const weekId = getWeekId(weekRef);
      const dayName = formatDayFull(new Date(`${userDateStr}T12:00:00Z`).getUTCDay());
      logger.debug({ userId, weekId, dayName }, 'createDeclaration');

      const userMessage = [
        `main_focus: ${answers.main_focus}`,
        `win_result: ${answers.win_result}`,
        `week_failure: ${answers.week_failure}`,
      ].join('\n');

      const idempotencyKey = `declaration:${userId}:${weekId}`;
      const response = await llm.complete(prompts.weeklyDeclaration(dayName), userMessage, {
        idempotencyKey,
        userId,
        traceId: getTraceId(),
        callType: 'declaration',
      });

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.DeclarationCreated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyDeclaration', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          main_focus: answers.main_focus,
          win_result: answers.win_result,
          week_failure: answers.week_failure,
          raw_post: response.content,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };

      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);

      return response.content;
    },

    async updateDeclarationManual(userId: string, answers: DeclarationAnswers): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const weekId = getWeekId(weekRef);
      logger.debug({ userId, weekId }, 'updateDeclarationManual');
      const existing = await pool.query<{ raw_post: string }>(
        'SELECT raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
        [userId, weekId]
      );
      const originalRawPost = existing.rows[0]?.raw_post ?? '';
      const appendix = [
        '',
        '---',
        '❗️ Ручное редактирование ответов:',
        `• Фокус: ${answers.main_focus}`,
        `• Результат: ${answers.win_result}`,
        `• Критерий срыва: ${answers.week_failure}`,
      ].join('\n');
      const newRawPost = originalRawPost + appendix;

      const idempotencyKey = `declaration:${userId}:${weekId}:manual`;
      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.DeclarationUpdated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyDeclaration', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          main_focus: answers.main_focus,
          win_result: answers.win_result,
          week_failure: answers.week_failure,
          raw_post: newRawPost,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };

      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);

      return newRawPost;
    },
  };
}
