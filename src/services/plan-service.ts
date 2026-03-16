import type { EventStore } from '../events/event-store.js';
import { logger } from '../observability/logger.js';
import { getTraceId } from '../observability/trace.js';
import type { DomainEvent } from '../events/types.js';
import { EVENT_TYPES } from '../events/types.js';
import { prompts } from '../llm/prompts.js';
import type { ServiceDeps } from './deps.js';
import { dateStrToWeekRef } from '../domain/timezone.js';
import { formatDayFull } from '../domain/date-format.js';
import { getProductLocalDate } from '../db/user-timezone.js';

export function getWeekId(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const sunday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return sunday.toISOString().slice(0, 10).replace(/-/g, '');
}

export function getWeekStartEnd(date: Date): { start: string; end: string } {
  const d = new Date(date);
  const day = d.getUTCDay();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function createPlanService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  return {
    async createPlan(
      userId: string,
      answers: {
        current_state: string;
        main_focus: string;
        weekly_result: string;
        why_now: string;
        distractions: string;
        main_risk: string;
      }
    ): Promise<string> {
      const userDateStr = await getProductLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const weekId = getWeekId(weekRef);
      const dayName = formatDayFull(new Date(`${userDateStr}T12:00:00Z`).getUTCDay());
      logger.debug({ userId, weekId, dayName }, 'createPlan');
      const { start, end } = getWeekStartEnd(weekRef);

      const userMessage = [
        `Где я сейчас: ${answers.current_state}`,
        `Главный фокус недели: ${answers.main_focus}`,
        `Конкретный результат недели: ${answers.weekly_result}`,
        `Почему это важно сейчас: ${answers.why_now}`,
        `Что ты точно не будешь делать: ${answers.distractions}`,
        `Главный риск: ${answers.main_risk}`,
      ].join('\n\n');

      const idempotencyKey = `plan:${userId}:${weekId}`;
      const response = await llm.complete(prompts.weeklyPlan(dayName), userMessage, {
        idempotencyKey,
        userId,
        traceId: getTraceId(),
        callType: 'plan',
      });

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.PlanCreated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyPlan', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          current_state: answers.current_state,
          main_focus: answers.main_focus,
          weekly_result: answers.weekly_result,
          why_now: answers.why_now,
          distractions: answers.distractions,
          main_risk: answers.main_risk,
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

    async updatePlanManual(
      userId: string,
      answers: {
        current_state: string;
        main_focus: string;
        weekly_result: string;
        why_now: string;
        distractions: string;
        main_risk: string;
      }
    ): Promise<string> {
      const userDateStr = await getProductLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const weekId = getWeekId(weekRef);
      logger.debug({ userId, weekId }, 'updatePlanManual');
      const existing = await pool.query<{ raw_post: string }>(
        'SELECT raw_post FROM weekly_plans WHERE user_id = $1 AND week_id = $2',
        [userId, weekId]
      );
      const originalRawPost = existing.rows[0]?.raw_post ?? '';
      const appendix = [
        '',
        '---',
        '❗️ Ручное редактирование ответов:',
        `• Где ты сейчас: ${answers.current_state}`,
        `• Главный фокус: ${answers.main_focus}`,
        `• Результат недели: ${answers.weekly_result}`,
        `• Почему важно сейчас: ${answers.why_now}`,
        `• Что ты точно не будешь делать: ${answers.distractions}`,
        `• Главный риск: ${answers.main_risk}`,
      ].join('\n');
      const newRawPost = originalRawPost + appendix;

      const idempotencyKey = `plan:${userId}:${weekId}:manual`;
      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.PlanUpdated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyPlan', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          current_state: answers.current_state,
          main_focus: answers.main_focus,
          weekly_result: answers.weekly_result,
          why_now: answers.why_now,
          distractions: answers.distractions,
          main_risk: answers.main_risk,
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
