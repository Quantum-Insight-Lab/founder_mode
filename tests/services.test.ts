import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { applyAllMigrations } from './apply-migrations.js';
import { createEventStore } from '../src/events/event-store.js';
import { createProjectors } from '../src/projectors/index.js';
import { createFixationService } from '../src/services/fixation-service.js';
import { createReportService } from '../src/services/report-service.js';
import { createDeclarationService } from '../src/services/declaration-service.js';
import { getWeekId } from '../src/services/week-service.js';

const dbUrl = process.env.TEST_DATABASE_URL;

const mockComplete = vi.fn().mockResolvedValue({ content: 'Fake LLM response', usage: { prompt_tokens: 0, completion_tokens: 0 }, model: 'test', latencyMs: 0 });
const mockLlm = { complete: mockComplete };

describe.skipIf(!dbUrl)('services', () => {
  let pool: Pool;
  let eventStore: ReturnType<typeof createEventStore>;
  let fixationService: ReturnType<typeof createFixationService>;
  let reportService: ReturnType<typeof createReportService>;
  let declarationService: ReturnType<typeof createDeclarationService>;

  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const tgId = 'test-user-123';

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await applyAllMigrations(pool);
  });

  beforeEach(async () => {
    mockComplete.mockClear();
    await pool.query(
      'TRUNCATE events, weekly_declarations, weekly_reports, daily_fixations, idempotency_cache, llm_calls CASCADE'
    );
    await pool.query('DELETE FROM users WHERE tg_id = $1', [tgId]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2) ON CONFLICT (tg_id) DO NOTHING', [userId, tgId]);

    eventStore = createEventStore(pool);
    const projectors = createProjectors(pool);
    const serviceDeps = { pool, projectors, llm: mockLlm };
    fixationService = createFixationService(eventStore, serviceDeps);
    reportService = createReportService(eventStore, serviceDeps);
    declarationService = createDeclarationService(eventStore, serviceDeps);
  });

  describe('fixationService', () => {
    beforeEach(async () => {
      const weekId = getWeekId(new Date().toISOString().slice(0, 10));
      await pool.query(
        `INSERT INTO weekly_declarations (user_id, week_id, main_focus, win_result, week_failure, raw_post)
         VALUES ($1, $2, 'focus', 'result', 'fail', 'raw')
         ON CONFLICT (user_id, week_id) DO UPDATE SET main_focus = 'focus'`,
        [userId, weekId]
      );
      mockComplete.mockClear();
    });

    it('INV-001: second reflection same day overwrites (upsert), one row per user/date', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const data1 = {
        date: today,
        movement_branch: 'yes' as const,
        what_moved: 'a',
        attention_sink: 'b',
        tomorrow_step: 'c',
      };
      const data2 = {
        date: today,
        movement_branch: 'no' as const,
        what_stopped: 'x',
        attention_sink: 'z',
        tomorrow_step: 'r',
      };

      await fixationService.submitFixation(userId, data1);
      mockComplete.mockClear();
      await fixationService.submitFixation(userId, data2);

      const rows = await pool.query('SELECT * FROM daily_fixations WHERE user_id = $1 AND date = $2', [userId, today]);
      expect(rows.rows.length).toBe(1);
    });

    it('INV-004: rejects reflection when date is in future', async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const data = {
        date: tomorrow,
        movement_branch: 'yes' as const,
        what_moved: 'x',
        attention_sink: 'y',
        tomorrow_step: 'z',
      };
      await expect(fixationService.submitFixation(userId, data)).rejects.toThrow(
        /Фиксация только за прошедшие дни/
      );
      expect(mockComplete).not.toHaveBeenCalled();
    });

    it('submits reflection and writes to events and daily_fixations', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const data = {
        date: today,
        movement_branch: 'yes' as const,
        what_moved: 'x',
        attention_sink: 'y',
        tomorrow_step: 'z',
      };

      const result = await fixationService.submitFixation(userId, data);

      expect(result).toBe('Fake LLM response');
      expect(mockComplete).toHaveBeenCalledTimes(1);

      const events = await pool.query('SELECT * FROM events WHERE event_type = $1', ['FixationSubmitted']);
      expect(events.rows.length).toBe(1);
      expect(events.rows[0].payload).toMatchObject({ user_id: userId, date: today, movement_branch: 'yes' });

      const reflections = await pool.query('SELECT * FROM daily_fixations WHERE user_id = $1 AND date = $2', [userId, today]);
      expect(reflections.rows.length).toBe(1);
    });
  });

  describe('reportService', () => {
    async function seedDeclarationForCurrentWeek() {
      const weekId = getWeekId(new Date().toISOString().slice(0, 10));
      await pool.query(
        `INSERT INTO weekly_declarations (user_id, week_id, main_focus, win_result, week_failure, raw_post)
         VALUES ($1, $2, 'focus', 'result', 'fail', 'raw')
         ON CONFLICT (user_id, week_id) DO UPDATE SET main_focus = 'focus'`,
        [userId, weekId]
      );
      return weekId;
    }

    /** Инвариант отчёта: минимум одна фиксация в локальной неделе (как в report-service). */
    async function seedOneFixationInCurrentWeek() {
      const today = new Date().toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO daily_fixations (
           user_id, date, day, had_movement, movement_branch, what_moved, attention_sink, tomorrow_step, raw_post
         ) VALUES ($1, $2, 'Monday', true, 'yes', 'x', 'y', 'z', 'raw')
         ON CONFLICT (user_id, date) DO UPDATE SET raw_post = EXCLUDED.raw_post`,
        [userId, today]
      );
    }

    it('renders deterministic card from text response', async () => {
      const weekId = await seedDeclarationForCurrentWeek();
      await seedOneFixationInCurrentWeek();
      mockComplete.mockResolvedValueOnce({
        content: 'Статус: частично\n\nФакт: Продукт запущен\n\nРазрыв: Нет канала пользователей',
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        model: 'test',
        latencyMs: 0,
      });

      const out = await reportService.createReport(userId);

      expect(out).toContain('Статус: частично');
      expect(out).toContain('Факт: Продукт запущен');
      expect(out).toContain('Разрыв: Нет канала пользователей');

      const rows = await pool.query('SELECT * FROM weekly_reports WHERE user_id = $1 AND week_id = $2', [userId, weekId]);
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0]).toMatchObject({
        raw_post: out,
      });
    });

    it('retries once when first LLM response is empty', async () => {
      await seedDeclarationForCurrentWeek();
      await seedOneFixationInCurrentWeek();
      mockComplete
        .mockResolvedValueOnce({
          content: '   ',
          usage: { prompt_tokens: 0, completion_tokens: 0 },
          model: 'test',
          latencyMs: 0,
        })
        .mockResolvedValueOnce({
          content: 'Статус: достигнут\n\nФакт: Продукт запущен\n\nРазрыв: Слабый охват',
          usage: { prompt_tokens: 0, completion_tokens: 0 },
          model: 'test',
          latencyMs: 0,
        });

      const out = await reportService.createReport(userId);

      expect(mockComplete).toHaveBeenCalledTimes(2);
      expect(out).toContain('Статус: достигнут');
    });

    it('keeps single event per week with same idempotency key', async () => {
      await seedDeclarationForCurrentWeek();
      await seedOneFixationInCurrentWeek();
      mockComplete.mockResolvedValue({
        content: 'Статус: достигнут\n\nФакт: Факт\n\nРазрыв: Разрыв',
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        model: 'test',
        latencyMs: 0,
      });

      await reportService.createReport(userId);
      await reportService.createReport(userId);

      const events = await pool.query(
        "SELECT * FROM events WHERE event_type = 'ReportCreated' AND (payload->>'user_id') = $1",
        [userId]
      );
      expect(events.rows.length).toBe(1);
    });

    it('throws when declaration for current week is missing', async () => {
      await expect(reportService.createReport(userId)).rejects.toThrow(
        /Нужна declaration недели для Report/
      );
      expect(mockComplete).not.toHaveBeenCalled();
    });

    it('throws when there are no fixations for the week', async () => {
      await seedDeclarationForCurrentWeek();
      await expect(reportService.createReport(userId)).rejects.toThrow(
        /зафиксировать хотя бы одну фиксацию/
      );
      expect(mockComplete).not.toHaveBeenCalled();
    });

    it('throws when both LLM attempts return empty text', async () => {
      await seedDeclarationForCurrentWeek();
      await seedOneFixationInCurrentWeek();
      mockComplete
        .mockResolvedValueOnce({
          content: '  ',
          usage: { prompt_tokens: 0, completion_tokens: 0 },
          model: 'test',
          latencyMs: 0,
        })
        .mockResolvedValueOnce({
          content: '\n\n',
          usage: { prompt_tokens: 0, completion_tokens: 0 },
          model: 'test',
          latencyMs: 0,
        });

      await expect(reportService.createReport(userId)).rejects.toThrow(
        /не удалось получить текст карточки/
      );
      expect(mockComplete).toHaveBeenCalledTimes(2);
    });
  });

  describe('declarationService', () => {
    const answers = { main_focus: 'фокус', win_result: 'результат', week_failure: 'провал' };

    it('createDeclaration writes read model and DeclarationCreated event', async () => {
      mockComplete.mockResolvedValueOnce({
        content: 'Фокус: A\n\nРезультат: B\n\nПровал: C',
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        model: 'test',
        latencyMs: 0,
      });

      const { rawPost, structured } = await declarationService.createDeclaration(userId, answers);

      expect(structured).toMatchObject(answers);
      expect(rawPost).toContain('Фокус:');

      const weekId = getWeekId(new Date().toISOString().slice(0, 10));
      const row = await pool.query('SELECT raw_post, main_focus FROM weekly_declarations WHERE user_id = $1 AND week_id = $2', [
        userId,
        weekId,
      ]);
      expect(row.rows.length).toBe(1);
      expect(row.rows[0]?.main_focus).toBe('фокус');

      const evs = await pool.query(
        `SELECT event_type FROM events WHERE event_type = 'DeclarationCreated' AND (payload->>'user_id') = $1`,
        [userId]
      );
      expect(evs.rows.length).toBe(1);
    });

    it('updateDeclarationManual appends DeclarationUpdated', async () => {
      mockComplete.mockResolvedValue({
        content: 'Фокус: X\n\nРезультат: Y\n\nПровал: Z',
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        model: 'test',
        latencyMs: 0,
      });
      await declarationService.createDeclaration(userId, answers);
      mockComplete.mockClear();

      await declarationService.updateDeclarationManual(userId, {
        main_focus: 'mf2',
        win_result: 'wr2',
        week_failure: 'wf2',
      });

      expect(mockComplete).toHaveBeenCalled();
      const upd = await pool.query(
        `SELECT COUNT(*)::int AS c FROM events WHERE event_type = 'DeclarationUpdated' AND (payload->>'user_id') = $1`,
        [userId]
      );
      expect(upd.rows[0]?.c).toBe(1);
    });

    it('updateDeclarationManual rejects when week has fixations', async () => {
      mockComplete.mockResolvedValue({
        content: 'Фокус: X\n\nРезультат: Y\n\nПровал: Z',
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        model: 'test',
        latencyMs: 0,
      });
      await declarationService.createDeclaration(userId, answers);
      const today = new Date().toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO daily_fixations (
           user_id, date, day, had_movement, movement_branch, what_moved, attention_sink, tomorrow_step, raw_post
         ) VALUES ($1, $2, 'Monday', true, 'yes', 'a', 'b', 'c', 'raw')`,
        [userId, today]
      );
      mockComplete.mockClear();
      await expect(
        declarationService.updateDeclarationManual(userId, {
          main_focus: 'mf2',
          win_result: 'wr2',
          week_failure: 'wf2',
        })
      ).rejects.toThrow(/Приоритет изменить нельзя/);
      expect(mockComplete).not.toHaveBeenCalled();
    });

    it('throws when declaration LLM returns empty twice', async () => {
      mockComplete
        .mockResolvedValueOnce({
          content: '   ',
          usage: { prompt_tokens: 0, completion_tokens: 0 },
          model: 'test',
          latencyMs: 0,
        })
        .mockResolvedValueOnce({
          content: '\n',
          usage: { prompt_tokens: 0, completion_tokens: 0 },
          model: 'test',
          latencyMs: 0,
        });

      await expect(declarationService.createDeclaration(userId, answers)).rejects.toThrow(
        /Declaration: не удалось получить текст карточки/
      );
      expect(mockComplete).toHaveBeenCalledTimes(2);
    });
  });
});
