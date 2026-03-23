import type { EventStore } from '../events/event-store.js';
import type { ReviewGeneratedEvent, ReviewGeneratedPayload } from '../events/types.js';
import type { WeeklyPlanRow, DailyFixationRow } from '../db/row-types.js';
import { EVENT_TYPES } from '../events/types.js';
import { prompts } from '../llm/prompts.js';
import type { ServiceDeps } from './deps.js';
import { validateReviewMinData } from '../db/review-validation.js';
import { config } from '../config/index.js';
import { getWeekId, getWeekStartEnd } from './plan-service.js';
import { dateStrToWeekRef } from '../domain/timezone.js';
import { formatDayFull } from '../domain/date-format.js';
import { getUserLocalDate } from '../db/user-timezone.js';
import { InvariantViolationError } from '../domain/errors.js';
import { logger } from '../observability/logger.js';
import { getTraceId } from '../observability/trace.js';
import { createHash } from 'crypto';

export function createReviewService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  return {
    async generateReview(
      userId: string,
      weekId?: string,
      optionalUserNote = '',
      prevalidated = false
    ): Promise<{ content: string }> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const targetWeekId = weekId ?? getWeekId(weekRef);
      const weekRefForRange = weekId
        ? new Date(
            `${weekId.slice(0, 4)}-${weekId.slice(4, 6)}-${weekId.slice(6, 8)}T12:00:00Z`
          )
        : weekRef;
      const { start, end } = getWeekStartEnd(weekRefForRange);
      logger.debug({ userId, weekId: targetWeekId, start, end }, 'generateReview');

      if (!prevalidated) {
        await validateReviewMinData(pool, userId, targetWeekId, start, end);
      }

      const planResult = await pool.query<WeeklyPlanRow>(
        'SELECT * FROM weekly_plans WHERE user_id = $1 AND week_id = $2',
        [userId, targetWeekId]
      );
      const plan = planResult.rows[0];
      if (!plan) {
        logger.debug({ userId, targetWeekId }, 'Review: plan not found');
        throw new InvariantViolationError('План не найден', 'NOT_FOUND');
      }

      const fixationsResult = await pool.query<DailyFixationRow>(
        `SELECT * FROM daily_fixations 
         WHERE user_id = $1 AND date >= $2 AND date <= $3
         ORDER BY date`,
        [userId, start, end]
      );
      const fixations = fixationsResult.rows;
      const minReflections = config().product.min_reflections_for_review;
      const useSoftPrompt = fixations.length < minReflections;

      const input = {
        day_range: { start, end },
        weekly_plan: {
          current_state: plan.current_state,
          main_focus: plan.main_focus,
          weekly_result: plan.weekly_result,
          week_failure: plan.week_failure,
        },
        daily_fixations: fixations.map((r) => ({
          day: r.day,
          had_movement: r.had_movement,
          movement_branch: r.movement_branch,
          what_moved: r.what_moved,
          tomorrow_step: r.tomorrow_step,
          what_stopped: r.what_stopped,
          attention_sink: r.attention_sink,
          thought_of_day: r.thought_of_day,
          why_partial: r.why_partial,
          new_focus: r.new_focus,
        })),
        optional_user_note: optionalUserNote,
      };

      const userMessage = JSON.stringify(input, null, 2);
      const noteSuffix = optionalUserNote
        ? `:n${createHash('sha256').update(optionalUserNote).digest('hex').slice(0, 12)}`
        : '';
      const dayName = formatDayFull(new Date(`${userDateStr}T12:00:00Z`).getUTCDay());
      const idempotencyKey = `review:${userId}:${targetWeekId}${useSoftPrompt ? ':soft' : ''}${noteSuffix}`;
      const systemPrompt = useSoftPrompt
        ? prompts.weeklyReviewSoft(dayName)
        : prompts.weeklyReview(dayName);
      const response = await llm.complete(systemPrompt, userMessage, {
        idempotencyKey,
        userId,
        traceId: getTraceId(),
        callType: 'review',
      });

      const payload: ReviewGeneratedPayload = {
        user_id: userId,
        week_id: targetWeekId,
        content: response.content,
        day_range_start: start,
        day_range_end: end,
      };

      const event: Omit<ReviewGeneratedEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.ReviewGenerated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyReview', id: `${userId}:${targetWeekId}` },
        payload,
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };

      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);

      return { content: response.content };
    },
  };
}
