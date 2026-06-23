/**
 * Projectors: Event -> Read Model (sync after append)
 */
import type { Pool } from 'pg';
import { EVENT_TYPES } from '../events/types.js';
import type {
  CommitmentSetEvent,
  CommitmentSwitchedEvent,
  DailyStepSubmittedEvent,
  DeclarationSetEvent,
  DigestSetEvent,
  DomainEvent,
  FixationSubmittedEvent,
  MatterDigestSetEvent,
  MatterSetEvent,
  MatterStepSubmittedEvent,
  MatterSwitchedEvent,
  PriorityChangedEvent,
  ReportSetEvent,
  UserRegisteredEvent,
} from '../events/types.js';

type LegacyDeclarationEvent = Omit<DeclarationSetEvent, 'event_type' | 'payload'> & {
  event_type: 'DeclarationCreated' | 'DeclarationUpdated';
  payload: Omit<DeclarationSetEvent['payload'], 'source'> & Partial<Pick<DeclarationSetEvent['payload'], 'source'>>;
};

type LegacyReportEvent = Omit<ReportSetEvent, 'event_type' | 'payload'> & {
  event_type: 'ReportCreated' | 'ReportUpdated';
  payload: Omit<ReportSetEvent['payload'], 'source'> & Partial<Pick<ReportSetEvent['payload'], 'source'>>;
};

type ProjectorEvent = DomainEvent | LegacyDeclarationEvent | LegacyReportEvent;

export function createProjectors(pool: Pool) {
  return {
    async handleEvent(event: ProjectorEvent): Promise<void> {
      switch (event.event_type) {
        case EVENT_TYPES.DeclarationSet:
        case 'DeclarationCreated':
        case 'DeclarationUpdated':
          await projectDeclaration(event);
          break;
        case EVENT_TYPES.PriorityChanged:
          await projectPriorityChange(event);
          break;
        case EVENT_TYPES.ReportSet:
        case 'ReportCreated':
        case 'ReportUpdated':
          await projectReport(event);
          break;
        case EVENT_TYPES.FixationSubmitted:
          await projectFixation(event);
          break;
        case EVENT_TYPES.UserRegistered:
          await projectUser(event);
          break;
        case EVENT_TYPES.MatterSet:
          await projectMatter(event);
          break;
        case EVENT_TYPES.MatterSwitched:
          await projectMatterSwitch(event);
          break;
        case EVENT_TYPES.MatterStepSubmitted:
          await projectMatterStep(event);
          break;
        case EVENT_TYPES.MatterDigestSet:
          await projectDigest(event);
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

  async function projectDeclaration(event: DeclarationSetEvent | LegacyDeclarationEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO weekly_declarations (
        user_id, week_id, main_focus, why_now, week_failure, raw_post, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id, week_id) DO UPDATE SET
        main_focus = EXCLUDED.main_focus,
        why_now = EXCLUDED.why_now,
        week_failure = EXCLUDED.week_failure,
        raw_post = EXCLUDED.raw_post,
        updated_at = NOW()`,
      [p.user_id, p.week_id, p.main_focus, p.why_now, p.week_failure, p.raw_post]
    );
  }

  async function projectReport(event: ReportSetEvent | LegacyReportEvent): Promise<void> {
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

  async function projectMatter(event: MatterSetEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO weekly_matters (
        user_id, week_id, title, why_postponed, cost_of_inaction, week_target, raw_post, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id, week_id) DO UPDATE SET
        title = EXCLUDED.title,
        why_postponed = EXCLUDED.why_postponed,
        cost_of_inaction = EXCLUDED.cost_of_inaction,
        week_target = EXCLUDED.week_target,
        raw_post = EXCLUDED.raw_post,
        updated_at = NOW()`,
      [
        p.user_id,
        p.week_id,
        p.title,
        p.why_postponed,
        p.cost_of_inaction,
        p.week_target,
        p.raw_post,
      ]
    );
  }

  async function projectMatterSwitch(event: MatterSwitchedEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO matter_switches (
        user_id, week_id, reason, new_title, new_target, raw_post, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id, week_id) DO UPDATE SET
        reason = EXCLUDED.reason,
        new_title = EXCLUDED.new_title,
        new_target = EXCLUDED.new_target,
        raw_post = EXCLUDED.raw_post,
        updated_at = NOW()`,
      [p.user_id, p.week_id, p.reason, p.new_title, p.new_target, p.raw_post]
    );
  }

  async function projectMatterStep(event: MatterStepSubmittedEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO matter_steps (
        user_id, date, day, had_movement, movement_branch, what_moved,
        tomorrow_step, what_stopped, avoidance,
        raw_post, why_partial, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (user_id, date) DO UPDATE SET
        day = EXCLUDED.day,
        had_movement = EXCLUDED.had_movement,
        movement_branch = EXCLUDED.movement_branch,
        what_moved = EXCLUDED.what_moved,
        tomorrow_step = EXCLUDED.tomorrow_step,
        what_stopped = EXCLUDED.what_stopped,
        avoidance = EXCLUDED.avoidance,
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
        p.avoidance ?? null,
        p.raw_post,
        p.why_partial ?? null,
      ]
    );
  }

  async function projectDigest(event: MatterDigestSetEvent): Promise<void> {
    const p = event.payload;
    await pool.query(
      `INSERT INTO weekly_digests (
        user_id, week_id, raw_post, updated_at
      ) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, week_id) DO UPDATE SET
        raw_post = EXCLUDED.raw_post,
        updated_at = NOW()`,
      [p.user_id, p.week_id, p.raw_post]
    );
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
      [
        p.user_id,
        p.mode,
        p.week_id,
        p.title,
        JSON.stringify(p.answers),
        p.raw_post,
      ]
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
