/**
 * Projectors: Event -> Read Model (sync after append)
 */
import type { Pool } from 'pg';
import { EVENT_TYPES } from '../events/types.js';
import type {
  DeclarationCreatedEvent,
  DeclarationUpdatedEvent,
  DomainEvent,
  FixationSubmittedEvent,
  PriorityChangedEvent,
  ReportCreatedEvent,
  ReportUpdatedEvent,
  UserRegisteredEvent,
} from '../events/types.js';

export function createProjectors(pool: Pool) {
  return {
    async handleEvent(event: DomainEvent): Promise<void> {
      switch (event.event_type) {
        case EVENT_TYPES.DeclarationCreated:
        case EVENT_TYPES.DeclarationUpdated:
          await projectDeclaration(event);
          break;
        case EVENT_TYPES.PriorityChanged:
          await projectPriorityChange(event);
          break;
        case EVENT_TYPES.ReportCreated:
        case EVENT_TYPES.ReportUpdated:
          await projectReport(event);
          break;
        case EVENT_TYPES.FixationSubmitted:
          await projectFixation(event);
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

  async function projectDeclaration(event: DeclarationCreatedEvent | DeclarationUpdatedEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO weekly_declarations (
        user_id, week_id, main_focus, why_now, win_result, week_failure, raw_post, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id, week_id) DO UPDATE SET
        main_focus = EXCLUDED.main_focus,
        why_now = EXCLUDED.why_now,
        win_result = EXCLUDED.win_result,
        week_failure = EXCLUDED.week_failure,
        raw_post = EXCLUDED.raw_post,
        updated_at = NOW()`,
      [p.user_id, p.week_id, p.main_focus, p.why_now, p.win_result, p.week_failure, p.raw_post]
    );
  }

  async function projectReport(
    event: ReportCreatedEvent | ReportUpdatedEvent
  ): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO weekly_reports (
        user_id, week_id, raw_post, updated_at
      ) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, week_id) DO UPDATE SET
        raw_post = EXCLUDED.raw_post,
        updated_at = NOW()`,
      [p.user_id, p.week_id, p.raw_post]
    );
  }

  async function projectPriorityChange(event: PriorityChangedEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO weekly_priority_changes (
        user_id, week_id, reason, new_focus, new_win, new_failure, raw_post, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id, week_id) DO UPDATE SET
        reason = EXCLUDED.reason,
        new_focus = EXCLUDED.new_focus,
        new_win = EXCLUDED.new_win,
        new_failure = EXCLUDED.new_failure,
        raw_post = EXCLUDED.raw_post,
        updated_at = NOW()`,
      [p.user_id, p.week_id, p.reason, p.new_focus, p.new_win, p.new_failure, p.raw_post]
    );
  }

  async function projectFixation(event: FixationSubmittedEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO daily_fixations (
        user_id, date, day, had_movement, movement_branch, what_moved,
        tomorrow_step, what_stopped, attention_sink,
        raw_post, why_partial, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (user_id, date) DO UPDATE SET
        day = EXCLUDED.day,
        had_movement = EXCLUDED.had_movement,
        movement_branch = EXCLUDED.movement_branch,
        what_moved = EXCLUDED.what_moved,
        tomorrow_step = EXCLUDED.tomorrow_step,
        what_stopped = EXCLUDED.what_stopped,
        attention_sink = EXCLUDED.attention_sink,
        raw_post = EXCLUDED.raw_post,
        why_partial = EXCLUDED.why_partial,
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
        p.raw_post,
        p.why_partial ?? null,
      ]
    );
  }
}
