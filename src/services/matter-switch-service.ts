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

interface MatterSwitchAnswers {
  reason: string;
  new_title: string;
  new_target: string;
}

interface MatterSwitchStructured {
  reason: string;
  new_title: string;
  new_target: string;
}

export function createMatterSwitchService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function ensureNoStepsAfterSwitch(userId: string, weekId: string): Promise<void> {
    const change = await pool.query<{ created_at: string }>(
      'SELECT created_at FROM matter_switches WHERE user_id = $1 AND week_id = $2 LIMIT 1',
      [userId, weekId]
    );
    const createdAt = change.rows[0]?.created_at;
    if (!createdAt) return;
    const mondayYmd = `${weekId.slice(0, 4)}-${weekId.slice(4, 6)}-${weekId.slice(6, 8)}`;
    const { start, end } = getWeekStartEnd(mondayYmd);
    const steps = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c
       FROM matter_steps
       WHERE user_id = $1
         AND date >= $2
         AND date <= $3
         AND created_at > $4::timestamptz`,
      [userId, start, end, createdAt]
    );
    if ((steps.rows[0]?.c ?? 0) > 0) {
      throw new InvariantViolationError(
        '⚠️ После смены дела уже были шаги. Менять нельзя — контекст уже записан.',
        'MATTER_SWITCH_LOCKED'
      );
    }
  }

  async function generateSwitchCardText(
    userId: string,
    weekId: string,
    answers: MatterSwitchAnswers,
    idempotencyKey: string
  ) {
    const userMessage = [
      `reason: ${answers.reason}`,
      `new_title: ${answers.new_title}`,
      `new_target: ${answers.new_target}`,
    ].join('\n');
    const response = await llm.complete(prompts.matterSwitch(), userMessage, {
      idempotencyKey,
      userId,
      traceId: getTraceId(),
      callType: 'switch',
    });
    const rawPost = ensureDoubleNewlinesIfMultiline(
      lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine((response.content ?? '').trim()))
    );
    if (!rawPost) {
      throw new InvariantViolationError('Смена дела: не удалось получить текст карточки', 'SERVICE_ERROR');
    }
    return rawPost;
  }

  return {
    async createMatterSwitch(
      userId: string,
      answers: MatterSwitchAnswers
    ): Promise<{ rawPost: string; structured: MatterSwitchStructured }> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      logger.debug({ userId, weekId }, 'createMatterSwitch');

      const matter = await pool.query(
        'SELECT 1 FROM weekly_matters WHERE user_id = $1 AND week_id = $2 LIMIT 1',
        [userId, weekId]
      );
      if (matter.rows.length === 0) {
        throw new InvariantViolationError('Сначала выбери дело недели: /matter', 'NOT_FOUND');
      }

      const existing = await pool.query(
        'SELECT 1 FROM matter_switches WHERE user_id = $1 AND week_id = $2 LIMIT 1',
        [userId, weekId]
      );
      if (existing.rows.length > 0) {
        throw new InvariantViolationError('⚠️ Смена дела на эту неделю уже есть.', 'MATTER_SWITCH_LIMIT');
      }

      const idempotencyKey = `matter_switch:${userId}:${weekId}`;
      const rawPost = await generateSwitchCardText(userId, weekId, answers, idempotencyKey);
      const structured: MatterSwitchStructured = {
        reason: answers.reason.trim(),
        new_title: answers.new_title.trim(),
        new_target: answers.new_target.trim(),
      };

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.MatterSwitched,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'MatterSwitch', id: `${userId}:${weekId}` },
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

    async updateMatterSwitchManual(
      userId: string,
      answers: MatterSwitchAnswers
    ): Promise<{ rawPost: string; structured: MatterSwitchStructured }> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekId = getWeekId(userDateStr);
      logger.debug({ userId, weekId }, 'updateMatterSwitchManual');

      const existing = await pool.query(
        'SELECT 1 FROM matter_switches WHERE user_id = $1 AND week_id = $2 LIMIT 1',
        [userId, weekId]
      );
      if (existing.rows.length === 0) {
        throw new InvariantViolationError('Смена дела на эту неделю ещё не задана. Напиши /switch', 'NOT_FOUND');
      }

      await ensureNoStepsAfterSwitch(userId, weekId);

      const idempotencyKey = `matter_switch:${userId}:${weekId}:manual:${randomUUID()}`;
      const rawPost = await generateSwitchCardText(userId, weekId, answers, idempotencyKey);
      const structured: MatterSwitchStructured = {
        reason: answers.reason.trim(),
        new_title: answers.new_title.trim(),
        new_target: answers.new_target.trim(),
      };

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.MatterSwitched,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'MatterSwitch', id: `${userId}:${weekId}` },
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
