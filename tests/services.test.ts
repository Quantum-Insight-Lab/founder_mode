import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createEventStore } from '../src/events/event-store.js';
import { createProjectors } from '../src/projectors/index.js';
import { createPlanService } from '../src/services/plan-service.js';
import { createReflectionService } from '../src/services/reflection-service.js';
import { createReviewService } from '../src/services/review-service.js';
import { getWeekId, getWeekStartEnd } from '../src/services/plan-service.js';

const dbUrl = process.env.TEST_DATABASE_URL;

const mockComplete = vi.fn().mockResolvedValue({ content: 'Fake LLM response', usage: { prompt_tokens: 0, completion_tokens: 0 }, model: 'test', latencyMs: 0 });
const mockLlm = { complete: mockComplete };

describe.skipIf(!dbUrl)('services', () => {
  let pool: Pool;
  let eventStore: ReturnType<typeof createEventStore>;
  let planService: ReturnType<typeof createPlanService>;
  let reflectionService: ReturnType<typeof createReflectionService>;
  let reviewService: ReturnType<typeof createReviewService>;

  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const tgId = 'test-user-123';

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    const sql = readFileSync(resolve(process.cwd(), 'migrations/001_init.sql'), 'utf-8');
    await pool.query(sql);
  });

  beforeEach(async () => {
    mockComplete.mockClear();
    await pool.query('TRUNCATE events, weekly_plans, daily_reflections, weekly_reviews, idempotency_cache, llm_calls CASCADE');
    await pool.query('DELETE FROM users WHERE tg_id = $1', [tgId]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2) ON CONFLICT (tg_id) DO NOTHING', [userId, tgId]);

    eventStore = createEventStore(pool);
    const projectors = createProjectors(pool);
    const serviceDeps = { pool, projectors, llm: mockLlm };
    planService = createPlanService(eventStore, serviceDeps);
    reflectionService = createReflectionService(eventStore, serviceDeps);
    reviewService = createReviewService(eventStore, serviceDeps);
  });

  describe('planService', () => {
    it('INV-002: second plan same week overwrites (upsert), one row per user/week', async () => {
      const answers = { current_state: 's', main_focus: 'f', weekly_result: 'r', week_failure: 'fail' };
      await planService.createPlan(userId, answers);
      mockComplete.mockClear();
      await planService.createPlan(userId, { ...answers, main_focus: 'f2' });

      const weekId = getWeekId(new Date());
      const rows = await pool.query('SELECT * FROM weekly_plans WHERE user_id = $1 AND week_id = $2', [userId, weekId]);
      expect(rows.rows.length).toBe(1);
    });

    it('creates plan and writes to events and weekly_plans', async () => {
      const answers = {
        current_state: 'test state',
        main_focus: 'focus',
        weekly_result: 'result',
        week_failure: 'no sales',
      };

      const result = await planService.createPlan(userId, answers);

      expect(result).toBe('Fake LLM response');
      expect(mockComplete).toHaveBeenCalledTimes(1);

      const events = await pool.query('SELECT * FROM events WHERE event_type = $1', ['PlanCreated']);
      expect(events.rows.length).toBe(1);
      expect(events.rows[0].payload).toMatchObject({ user_id: userId, main_focus: 'focus' });

      const weekId = getWeekId(new Date());
      const plans = await pool.query('SELECT * FROM weekly_plans WHERE user_id = $1 AND week_id = $2', [userId, weekId]);
      expect(plans.rows.length).toBe(1);
    });
  });

  describe('reflectionService', () => {
    beforeEach(async () => {
      await planService.createPlan(userId, {
        current_state: 's',
        main_focus: 'f',
        weekly_result: 'r',
        week_failure: 'f',
      });
      mockComplete.mockClear();
    });

    it('INV-001: second reflection same day overwrites (upsert), one row per user/date', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const data1 = {
        date: today,
        movement_branch: 'yes',
        what_moved: 'a',
        attention_sink: 'b',
        tomorrow_step: 'c',
        thought_of_day: 't1',
      };
      const data2 = {
        date: today,
        movement_branch: 'no',
        what_stopped: 'x',
        attention_sink: 'z',
        tomorrow_step: 'r',
        thought_of_day: 't2',
      };

      await reflectionService.submitReflection(userId, data1);
      mockComplete.mockClear();
      await reflectionService.submitReflection(userId, data2);

      const rows = await pool.query('SELECT * FROM daily_reflections WHERE user_id = $1 AND date = $2', [userId, today]);
      expect(rows.rows.length).toBe(1);
    });

    it('INV-004: rejects reflection when date is in future', async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const data = {
        date: tomorrow,
        movement_branch: 'yes',
        what_moved: 'x',
        attention_sink: 'y',
        tomorrow_step: 'z',
        thought_of_day: 't',
      };
      await expect(reflectionService.submitReflection(userId, data)).rejects.toThrow(
        /Рефлексия только за прошедшие дни/
      );
      expect(mockComplete).not.toHaveBeenCalled();
    });

    it('submits reflection and writes to events and daily_reflections', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const data = {
        date: today,
        movement_branch: 'yes',
        what_moved: 'x',
        attention_sink: 'y',
        tomorrow_step: 'z',
        thought_of_day: 'thought',
      };

      const result = await reflectionService.submitReflection(userId, data);

      expect(result).toBe('Fake LLM response');
      expect(mockComplete).toHaveBeenCalledTimes(1);

      const events = await pool.query('SELECT * FROM events WHERE event_type = $1', ['ReflectionSubmitted']);
      expect(events.rows.length).toBe(1);
      expect(events.rows[0].payload).toMatchObject({ user_id: userId, date: today, movement_branch: 'yes' });

      const reflections = await pool.query('SELECT * FROM daily_reflections WHERE user_id = $1 AND date = $2', [userId, today]);
      expect(reflections.rows.length).toBe(1);
    });
  });

  describe('reviewService', () => {
    it('throws when plan not found', async () => {
      await expect(reviewService.generateReview(userId)).rejects.toThrow(/Нужен план недели для обзора/);
    });

    it('INV-007: does not return another user\'s plan — user A gets error when only user B has data', async () => {
      const userAId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const userBId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      await pool.query(
        'INSERT INTO users (user_id, tg_id) VALUES ($1, $2), ($3, $4) ON CONFLICT (tg_id) DO NOTHING',
        [userAId, 'user-A-007', userBId, 'user-B-007']
      );
      const weekId = getWeekId(new Date());
      await pool.query(
        `INSERT INTO weekly_plans (user_id, week_id, main_focus, weekly_result, raw_post)
         VALUES ($1, $2, 'secret', 'r', 'p') ON CONFLICT (user_id, week_id) DO UPDATE SET main_focus = 'secret'`,
        [userBId, weekId]
      );
      const { start } = getWeekStartEnd(new Date());
      for (let i = 0; i < 3; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const date = d.toISOString().slice(0, 10);
        const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
        await pool.query(
          `INSERT INTO daily_reflections (user_id, date, day, had_movement, thought_of_day, raw_post)
           VALUES ($1, $2, $3, true, 't', 'r') ON CONFLICT (user_id, date) DO UPDATE SET thought_of_day = 't'`,
          [userBId, date, day]
        );
      }

      await expect(reviewService.generateReview(userAId)).rejects.toThrow(/Нужен план недели для обзора/);
      expect(mockComplete).not.toHaveBeenCalled();
    });

    it('throws when insufficient reflections', async () => {
      const weekId = getWeekId(new Date());
      await pool.query(
        `INSERT INTO weekly_plans (user_id, week_id, main_focus, weekly_result, raw_post)
         VALUES ($1, $2, 'f', 'r', 'p') ON CONFLICT (user_id, week_id) DO UPDATE SET main_focus = 'f'`,
        [userId, weekId]
      );
      // 0 reflections — validation should reject

      await expect(reviewService.generateReview(userId)).rejects.toThrow(/одна рефлексия|Сейчас: 0/);
    });

    it('generates review when plan and 3+ reflections exist', async () => {
      const { start, end } = getWeekStartEnd(new Date());
      const weekId = getWeekId(new Date());
      await pool.query(
        `INSERT INTO weekly_plans (user_id, week_id, main_focus, weekly_result, raw_post)
         VALUES ($1, $2, 'f', 'r', 'p') ON CONFLICT (user_id, week_id) DO UPDATE SET main_focus = 'f'`,
        [userId, weekId]
      );
      const dates = [start];
      let d = new Date(start);
      for (let i = 1; i < 3; i++) {
        d.setDate(d.getDate() + 1);
        dates.push(d.toISOString().slice(0, 10));
      }
      for (const date of dates) {
        const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(date).getDay()];
        await pool.query(
          `INSERT INTO daily_reflections (user_id, date, day, had_movement, thought_of_day, raw_post)
           VALUES ($1, $2, $3, true, 't', 'r') ON CONFLICT (user_id, date) DO UPDATE SET thought_of_day = 't'`,
          [userId, date, day]
        );
      }

      const result = await reviewService.generateReview(userId);

      expect('content' in result).toBe(true);
      expect((result as { content: string }).content).toBe('Fake LLM response');
      expect(mockComplete).toHaveBeenCalledTimes(1);
    });

    it('INV-005: reflections outside day_range are not in review input', async () => {
      const { start, end } = getWeekStartEnd(new Date());
      const weekId = getWeekId(new Date());
      await pool.query(
        `INSERT INTO weekly_plans (user_id, week_id, main_focus, weekly_result, raw_post)
         VALUES ($1, $2, 'f', 'r', 'p') ON CONFLICT (user_id, week_id) DO UPDATE SET main_focus = 'f'`,
        [userId, weekId]
      );
      let d = new Date(start);
      for (let i = 0; i < 3; i++) {
        const date = d.toISOString().slice(0, 10);
        const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(date).getDay()];
        await pool.query(
          `INSERT INTO daily_reflections (user_id, date, day, had_movement, thought_of_day, raw_post)
           VALUES ($1, $2, $3, true, 't', 'r') ON CONFLICT (user_id, date) DO UPDATE SET thought_of_day = 't'`,
          [userId, date, day]
        );
        d.setDate(d.getDate() + 1);
      }
      const outsideDate = new Date(end);
      outsideDate.setDate(outsideDate.getDate() + 1);
      const outsideStr = outsideDate.toISOString().slice(0, 10);
      const outsideDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][outsideDate.getDay()];
      await pool.query(
        `INSERT INTO daily_reflections (user_id, date, day, had_movement, thought_of_day, raw_post)
         VALUES ($1, $2, $3, true, 'outside', 'r') ON CONFLICT (user_id, date) DO UPDATE SET thought_of_day = 'outside'`,
        [userId, outsideStr, outsideDay]
      );

      await reviewService.generateReview(userId);

      const call = mockComplete.mock.calls[0];
      const userMessage = call[1] as string;
      const input = JSON.parse(userMessage) as { day_range: { start: string; end: string }; daily_reflections: { thought_of_day?: string }[] };
      expect(input.day_range.start).toBe(start);
      expect(input.day_range.end).toBe(end);
      expect(input.daily_reflections.map((r) => r.thought_of_day)).not.toContain('outside');
    });

    it('INV-010: review uses same week_id and day_range as plan', async () => {
      const { start, end } = getWeekStartEnd(new Date());
      const weekId = getWeekId(new Date());
      await pool.query(
        `INSERT INTO weekly_plans (user_id, week_id, main_focus, weekly_result, raw_post)
         VALUES ($1, $2, 'f', 'r', 'p') ON CONFLICT (user_id, week_id) DO UPDATE SET main_focus = 'f'`,
        [userId, weekId]
      );
      const dates = [start];
      let d = new Date(start);
      for (let i = 1; i < 3; i++) {
        d.setDate(d.getDate() + 1);
        dates.push(d.toISOString().slice(0, 10));
      }
      for (const date of dates) {
        const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(date).getDay()];
        await pool.query(
          `INSERT INTO daily_reflections (user_id, date, day, had_movement, thought_of_day, raw_post)
           VALUES ($1, $2, $3, true, 't', 'r') ON CONFLICT (user_id, date) DO UPDATE SET thought_of_day = 't'`,
          [userId, date, day]
        );
      }

      await reviewService.generateReview(userId);

      const reviewRows = await pool.query('SELECT * FROM weekly_reviews WHERE user_id = $1 AND week_id = $2', [userId, weekId]);
      expect(reviewRows.rows.length).toBe(1);
      expect(reviewRows.rows[0].user_id).toBe(userId);
      expect(reviewRows.rows[0].week_id).toBe(weekId);

      const eventRows = await pool.query('SELECT payload FROM events WHERE event_type = $1 AND (payload->>\'user_id\') = $2 ORDER BY occurred_at DESC LIMIT 1', ['ReviewGenerated', userId]);
      expect(eventRows.rows.length).toBe(1);
      const payload = eventRows.rows[0].payload as { week_id: string; day_range_start: string; day_range_end: string };
      expect(payload.week_id).toBe(weekId);
      expect(payload.day_range_start).toBe(start);
      expect(payload.day_range_end).toBe(end);
    });
  });
});
