/**
 * Projectors: Event -> Read Model (sync after append)
 */
import type { Pool } from 'pg';
import { EVENT_TYPES } from '../events/types.js';
import type {
  CommitmentSetEvent,
  CommitmentSwitchedEvent,
  DailyStepSubmittedEvent,
  DigestSetEvent,
  DomainEvent,
  UserRegisteredEvent,
} from '../events/types.js';

export function createProjectors(pool: Pool) {
  return {
    async handleEvent(event: DomainEvent): Promise<void> {
      switch (event.event_type) {
        case EVENT_TYPES.UserRegistered:
          await projectUser(event);
          break;
        case EVENT_TYPES.CommitmentSet:
          await projectEngineCommitment(event);
          break;
        case EVENT_TYPES.CommitmentSwitched:
          await projectEngineSwitch(event);
          break;
        case EVENT_TYPES.DailyStepSubmitted:
          await projectEngineStep(event);
          break;
        case EVENT_TYPES.DigestSet:
          await projectEngineDigest(event);
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

  async function projectEngineDigest(event: DigestSetEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO engine_digests (user_id, mode, week_id, raw_post, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, mode, week_id) DO UPDATE SET
         raw_post = EXCLUDED.raw_post,
         updated_at = NOW()`,
      [p.user_id, p.mode, p.week_id, p.raw_post]
    );
  }

  async function projectEngineCommitment(event: CommitmentSetEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO engine_commitments (
         user_id, mode, week_id, title, answers, raw_post, updated_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
       ON CONFLICT (user_id, mode, week_id) DO UPDATE SET
         title = EXCLUDED.title,
         answers = EXCLUDED.answers,
         raw_post = EXCLUDED.raw_post,
         updated_at = NOW()`,
      [p.user_id, p.mode, p.week_id, p.title, JSON.stringify(p.answers), p.raw_post]
    );
  }

  async function projectEngineSwitch(event: CommitmentSwitchedEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO engine_switches (user_id, mode, week_id, answers, raw_post, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
       ON CONFLICT (user_id, mode, week_id) DO UPDATE SET
         answers = EXCLUDED.answers,
         raw_post = EXCLUDED.raw_post,
         updated_at = NOW()`,
      [p.user_id, p.mode, p.week_id, JSON.stringify(p.answers), p.raw_post]
    );
  }

  async function projectEngineStep(event: DailyStepSubmittedEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO engine_steps (
         user_id, mode, date, day, movement_branch, answers, raw_post, updated_at
       ) VALUES ($1, $2, $3::date, $4, $5, $6::jsonb, $7, NOW())
       ON CONFLICT (user_id, mode, date) DO UPDATE SET
         day = EXCLUDED.day,
         movement_branch = EXCLUDED.movement_branch,
         answers = EXCLUDED.answers,
         raw_post = EXCLUDED.raw_post,
         updated_at = NOW()`,
      [
        p.user_id,
        p.mode,
        p.date,
        p.day,
        p.movement_branch,
        JSON.stringify(p.answers),
        p.raw_post,
      ]
    );
  }
}
