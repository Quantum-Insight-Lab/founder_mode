/**
 * Projectors: Event -> Read Model (sync after append)
 */
import type { Pool } from 'pg';
import { EVENT_TYPES } from '../events/types.js';
import type {
  DomainEvent,
  PlanCreatedEvent,
  PlanUpdatedEvent,
  ReflectionSubmittedEvent,
  ReviewGeneratedEvent,
  UserRegisteredEvent,
} from '../events/types.js';

export function createProjectors(pool: Pool) {
  return {
    async handleEvent(event: DomainEvent): Promise<void> {
      switch (event.event_type) {
        case EVENT_TYPES.PlanCreated:
        case EVENT_TYPES.PlanUpdated:
          await projectPlan(event);
          break;
        case EVENT_TYPES.ReflectionSubmitted:
          await projectReflection(event);
          break;
        case EVENT_TYPES.ReviewGenerated:
          await projectReview(event);
          break;
        case EVENT_TYPES.UserRegistered:
          await projectUser(event);
          break;
        default:
          break;
      }
    },
  };

  async function projectUser(event: UserRegisteredEvent): Promise<void> {
    const { user_id, tg_id, max_id } = event.payload;
    if (tg_id) {
      await pool.query(
        `INSERT INTO users (user_id, tg_id, max_id) VALUES ($1, $2, NULL)
         ON CONFLICT (tg_id) DO NOTHING`,
        [user_id, tg_id]
      );
    }
    if (max_id) {
      await pool.query(
        `INSERT INTO users (user_id, tg_id, max_id) VALUES ($1, NULL, $2)
         ON CONFLICT (max_id) DO NOTHING`,
        [user_id, max_id]
      );
    }
  }

  async function projectPlan(event: PlanCreatedEvent | PlanUpdatedEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO weekly_plans (
        user_id, week_id, current_state, main_focus, weekly_result,
        why_now, distractions, main_risk, raw_post, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (user_id, week_id) DO UPDATE SET
        current_state = EXCLUDED.current_state,
        main_focus = EXCLUDED.main_focus,
        weekly_result = EXCLUDED.weekly_result,
        why_now = EXCLUDED.why_now,
        distractions = EXCLUDED.distractions,
        main_risk = EXCLUDED.main_risk,
        raw_post = EXCLUDED.raw_post,
        updated_at = NOW()`,
      [
        p.user_id,
        p.week_id,
        p.current_state,
        p.main_focus,
        p.weekly_result,
        p.why_now,
        p.distractions,
        p.main_risk,
        p.raw_post,
      ]
    );
  }

  async function projectReflection(event: ReflectionSubmittedEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO daily_reflections (
        user_id, date, day, had_movement, movement_branch, what_moved,
        tomorrow_step, what_stopped, attention_sink,
        thought_of_day, raw_post, why_partial, new_focus, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (user_id, date) DO UPDATE SET
        day = EXCLUDED.day,
        had_movement = EXCLUDED.had_movement,
        movement_branch = EXCLUDED.movement_branch,
        what_moved = EXCLUDED.what_moved,
        tomorrow_step = EXCLUDED.tomorrow_step,
        what_stopped = EXCLUDED.what_stopped,
        attention_sink = EXCLUDED.attention_sink,
        thought_of_day = EXCLUDED.thought_of_day,
        raw_post = EXCLUDED.raw_post,
        why_partial = EXCLUDED.why_partial,
        new_focus = EXCLUDED.new_focus,
        updated_at = NOW()`,
      [
        p.user_id,
        p.date,
        p.day,
        p.had_movement,
        p.movement_branch ?? null,
        p.what_moved ?? null,
        p.tomorrow_step ?? null,
        p.what_stopped ?? null,
        p.attention_sink ?? null,
        p.thought_of_day,
        p.raw_post,
        p.why_partial ?? null,
        p.new_focus ?? null,
      ]
    );
  }

  async function projectReview(event: ReviewGeneratedEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO weekly_reviews (user_id, week_id, content) 
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, week_id) DO UPDATE SET content = EXCLUDED.content`,
      [p.user_id, p.week_id, p.content]
    );
  }
}
