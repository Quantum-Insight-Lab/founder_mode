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
import { matterAreaLabel } from '../bot/closure-conversations.js';

interface MatterAnswers {
  title: string;
  area_key: string;
  area_custom?: string | null;
  why_postponed: string;
  cost_of_inaction: string;
  week_target: string;
}

interface MatterStructured {
  title: string;
  area_key: string;
  area_custom: string | null;
  why_postponed: string;
  cost_of_inaction: string;
  week_target: string;
}

function validateMatterAnswers(answers: MatterAnswers): void {
  if ((answers.area_key ?? '').trim() !== 'other') return;
  if (!(answers.area_custom ?? '').trim()) {
    throw new InvariantViolationError('Укажи сферу своими словами', 'MATTER_AREA_OTHER');
  }
}

export function createMatterService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function generateMatterContent(
    userId: string,
    weekId: string,
    answers: MatterAnswers,
    idempotencyKey: string
  ): Promise<{ rawPost: string }> {
    validateMatterAnswers(answers);
    const userMessage = [
      `title: ${answers.title}`,
      `area: ${matterAreaLabel(answers.area_key, answers.area_custom)}`,
      `why_postponed: ${answers.why_postponed}`,
      `cost_of_inaction: ${answers.cost_of_inaction}`,
      `week_target: ${answers.week_target}`,
    ].join('\n');

    let rawPost = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptIdempotencyKey = attempt === 0 ? idempotencyKey : `${idempotencyKey}:retry_text_${attempt}`;
      const attemptUserMessage =
        attempt === 0
          ? userMessage
          : `${userMessage}\n\nВерни только итоговый текст карточки, без markdown и комментариев.`;
      const response = await llm.complete(prompts.matter(), attemptUserMessage, {
        idempotencyKey: attemptIdempotencyKey,
        userId,
        traceId: getTraceId(),
        callType: 'matter',
      });
      rawPost = ensureDoubleNewlinesIfMultiline(
        lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine((response.content ?? '').trim()))
      );
      if (rawPost.length > 0) break;
      logger.warn({ userId, weekId, attempt }, 'Matter text response is empty');
    }

    if (!rawPost) {
      throw new Error('Matter: не удалось получить текст карточки');
    }
    return { rawPost };
  }

  function toStructured(answers: MatterAnswers): MatterStructured {
    validateMatterAnswers(answers);
    const areaCustom =
      answers.area_key.trim() === 'other' ? (answers.area_custom ?? '').trim() || null : null;
    return {
      title: answers.title.trim(),
      area_key: answers.area_key.trim(),
      area_custom: areaCustom,
      why_postponed: answers.why_postponed.trim(),
      cost_of_inaction: answers.cost_of_inaction.trim(),
      week_target: answers.week_target.trim(),
    };
  }

  return {
    async createMatter(
      userId: string,
      answers: MatterAnswers
    ): Promise<{ rawPost: string; structured: MatterStructured }> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      logger.debug({ userId, weekId }, 'createMatter');

      const idempotencyKey = `matter:${userId}:${weekId}`;
      const structured = toStructured(answers);
      const { rawPost } = await generateMatterContent(userId, weekId, answers, idempotencyKey);

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.MatterSet,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyMatter', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          ...structured,
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
      return { rawPost, structured };
    },

    async updateMatterManual(
      userId: string,
      answers: MatterAnswers
    ): Promise<{ rawPost: string; structured: MatterStructured }> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      logger.debug({ userId, weekId }, 'updateMatterManual');

      const { start, end } = getWeekStartEnd(userDateStr);
      const stepCount = await pool.query<{ c: number }>(
        'SELECT COUNT(*)::int AS c FROM matter_steps WHERE user_id = $1 AND date >= $2 AND date <= $3',
        [userId, start, end]
      );
      if ((stepCount.rows[0]?.c ?? 0) > 0) {
        throw new InvariantViolationError(
          '⚠️ На этой неделе уже есть шаги. Дело можно изменить только через /switch.',
          'MATTER_LOCKED'
        );
      }

      const idempotencyKey = `matter:${userId}:${weekId}:manual:${randomUUID()}`;
      const structured = toStructured(answers);
      const { rawPost } = await generateMatterContent(userId, weekId, answers, idempotencyKey);

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.MatterSet,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyMatter', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          ...structured,
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
      return { rawPost, structured };
    },
  };
}
