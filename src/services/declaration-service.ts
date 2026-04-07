import type { EventStore } from '../events/event-store.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../observability/logger.js';
import { getTraceId } from '../observability/trace.js';
import type { DomainEvent } from '../events/types.js';
import { EVENT_TYPES } from '../events/types.js';
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

interface DeclarationAnswers {
  main_focus: string;
  why_now: string;
  win_result: string;
  week_failure: string;
}

interface DeclarationStructured {
  main_focus: string;
  why_now: string;
  win_result: string;
  week_failure: string;
}

export function createDeclarationService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function generateDeclarationContent(
    userId: string,
    weekId: string,
    answers: DeclarationAnswers,
    idempotencyKey: string
  ): Promise<{ rawPost: string }> {
    const userMessage = [
      `main_focus: ${answers.main_focus}`,
      `why_now: ${answers.why_now}`,
      `win_result: ${answers.win_result}`,
      `week_failure: ${answers.week_failure}`,
    ].join('\n');

    let rawPost = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptIdempotencyKey = attempt === 0 ? idempotencyKey : `${idempotencyKey}:retry_text_${attempt}`;
      const attemptUserMessage =
        attempt === 0
          ? userMessage
          : `${userMessage}\n\nВерни только итоговый текст карточки, без markdown и комментариев.`;
      const response = await llm.complete(prompts.weeklyDeclaration(), attemptUserMessage, {
        idempotencyKey: attemptIdempotencyKey,
        userId,
        traceId: getTraceId(),
        callType: 'declaration',
      });
      rawPost = ensureDoubleNewlinesIfMultiline(
        lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine((response.content ?? '').trim()))
      );
      if (rawPost.length > 0) break;
      logger.warn({ userId, weekId, attempt }, 'Declaration text response is empty');
    }

    if (!rawPost) {
      throw new Error('Declaration: не удалось получить текст карточки');
    }
    return { rawPost };
  }

  return {
    async createDeclaration(
      userId: string,
      answers: DeclarationAnswers
    ): Promise<{ rawPost: string; structured: DeclarationStructured }> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      logger.debug({ userId, weekId }, 'createDeclaration');

      const idempotencyKey = `declaration:${userId}:${weekId}`;
      const { rawPost } = await generateDeclarationContent(userId, weekId, answers, idempotencyKey);
      const structured: DeclarationStructured = {
        main_focus: answers.main_focus.trim(),
        why_now: answers.why_now.trim(),
        win_result: answers.win_result.trim(),
        week_failure: answers.week_failure.trim(),
      };

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.DeclarationCreated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyDeclaration', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          main_focus: structured.main_focus,
          why_now: structured.why_now,
          win_result: structured.win_result,
          week_failure: structured.week_failure,
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

    async updateDeclarationManual(
      userId: string,
      answers: DeclarationAnswers
    ): Promise<{ rawPost: string; structured: DeclarationStructured }> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      logger.debug({ userId, weekId }, 'updateDeclarationManual');

      const { start, end } = getWeekStartEnd(userDateStr);
      const fixCount = await pool.query<{ c: number }>(
        'SELECT COUNT(*)::int AS c FROM daily_fixations WHERE user_id = $1 AND date >= $2 AND date <= $3',
        [userId, start, end]
      );
      if ((fixCount.rows[0]?.c ?? 0) > 0) {
        throw new InvariantViolationError(
          '⚠️ На этой неделе уже есть фиксации дня. Приоритет можно изменить только 1 раз за неделю через /change.',
          'DECLARATION_LOCKED'
        );
      }

      const idempotencyKey = `declaration:${userId}:${weekId}:manual:${randomUUID()}`;
      const { rawPost } = await generateDeclarationContent(userId, weekId, answers, idempotencyKey);
      const structured: DeclarationStructured = {
        main_focus: answers.main_focus.trim(),
        why_now: answers.why_now.trim(),
        win_result: answers.win_result.trim(),
        week_failure: answers.week_failure.trim(),
      };
      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.DeclarationUpdated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyDeclaration', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          main_focus: structured.main_focus,
          why_now: structured.why_now,
          win_result: structured.win_result,
          week_failure: structured.week_failure,
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
