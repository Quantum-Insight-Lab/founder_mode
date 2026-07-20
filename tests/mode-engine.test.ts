import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { applyAllMigrations } from './apply-migrations.js';
import { ENGINE_MODES, isEngineMode } from '../src/services/product-mode.js';
import { MODE_CONFIGS, validateModeConfigs } from '../src/modes/registry.js';
import { prompts } from '../src/llm/prompts.js';
import type { LlmPromptKey } from '../src/modes/types.js';
import { withEngineMode } from '../src/bot/with-engine-mode.js';
import type { AppContext } from '../src/bot/transport/types.js';
import type { HandlerDeps } from '../src/bot/handlers/deps.js';
import { createEventStore } from '../src/events/event-store.js';
import { createProjectors } from '../src/projectors/index.js';
import { createEngineServices } from '../src/services/engine/index.js';
import { InvariantViolationError } from '../src/domain/errors.js';
import { getWeekId } from '../src/services/week-service.js';

const dbUrl = process.env.TEST_DATABASE_URL;

function collectPromptKeys(): LlmPromptKey[] {
  const keys = new Set<LlmPromptKey>();
  for (const config of Object.values(MODE_CONFIGS)) {
    keys.add(config.commitment.llmPromptKey);
    keys.add(config.daily.llmPromptKey);
    keys.add(config.digest.llmPromptKey);
    keys.add(config.switchFlow.llmPromptKey);
  }
  return [...keys];
}

describe('mode engine registry', () => {
  it('all engine modes have configs', () => {
    for (const mode of ENGINE_MODES) {
      expect(MODE_CONFIGS[mode].key).toBe(mode);
    }
  });

  it('validateModeConfigs returns no duplicate key errors', () => {
    expect(validateModeConfigs()).toEqual([]);
  });

  it('all referenced LLM prompts exist', () => {
    for (const key of collectPromptKeys()) {
      expect(typeof (prompts as Record<string, () => string>)[key]).toBe('function');
      expect((prompts as Record<string, () => string>)[key]().length).toBeGreaterThan(10);
    }
  });
});

describe('withEngineMode guard', () => {
  it('blocks when mode unset', async () => {
    const replies: string[] = [];
    const ctx = {
      userId: 'u1',
      async reply(text: string) {
        replies.push(text);
      },
    } as unknown as AppContext;
    const deps = {
      getUserProductMode: async () => null,
    } as HandlerDeps;
    const handler = vi.fn();
    await withEngineMode(handler)(ctx, deps);
    expect(handler).not.toHaveBeenCalled();
    expect(replies[0]).toContain('режим');
  });

  it('pivot flow has exactly 3 questions in every mode', () => {
    for (const mode of ENGINE_MODES) {
      expect(MODE_CONFIGS[mode].switchFlow.questions).toHaveLength(3);
    }
  });

  it('allows engine mode', async () => {
    const ctx = { userId: 'u1', async reply() {} } as unknown as AppContext;
    const deps = {
      getUserProductMode: async () => 'learning' as const,
    } as HandlerDeps;
    const handler = vi.fn();
    await withEngineMode(handler)(ctx, deps);
    expect(handler).toHaveBeenCalledWith(ctx, deps, 'learning', MODE_CONFIGS.learning);
  });
});

describe.skipIf(!dbUrl)('engine services', () => {
  let pool: Pool;
  let services: ReturnType<typeof createEngineServices>;
  const userId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const tgId = 'engine-test-user';

  const mockComplete = vi.fn().mockResolvedValue({
    content: 'Fake engine card',
    usage: { prompt_tokens: 0, completion_tokens: 0 },
    model: 'test',
    latencyMs: 0,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await applyAllMigrations(pool);
  });

  beforeEach(async () => {
    mockComplete.mockClear();
    await pool.query(
      'TRUNCATE events, engine_commitments, engine_switches, engine_steps, engine_digests, idempotency_cache CASCADE'
    );
    await pool.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2)', [userId, tgId]);
    await pool.query(
      `INSERT INTO user_settings (user_id, product_mode, timezone) VALUES ($1, 'learning', 'UTC+3')`,
      [userId]
    );

    const eventStore = createEventStore(pool);
    const projectors = createProjectors(pool);
    services = createEngineServices(eventStore, { pool, projectors, llm: { complete: mockComplete } });
  });

  it('createCommitment writes engine_commitments', async () => {
    await services.commitment.createCommitment(userId, 'learning', {
      title: 'TypeScript',
      answers: { why_now: 'career', week_target: 'basics', practice_plan: 'daily' },
    });
    const weekId = getWeekId(new Date().toISOString().slice(0, 10));
    const row = await pool.query('SELECT title, mode, week_id FROM engine_commitments WHERE user_id = $1', [userId]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].title).toBe('TypeScript');
    expect(row.rows[0].mode).toBe('learning');
    expect(isEngineMode(row.rows[0].mode)).toBe(true);
    expect(row.rows[0].week_id).toBe(weekId);
  });

  it('updateCommitmentManual locked when steps exist', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await services.commitment.createCommitment(userId, 'learning', {
      title: 'Go',
      answers: { why_now: 'x', week_target: 'y', practice_plan: 'z' },
    });
    await services.step.submitStep(userId, 'learning', {
      date: today,
      movement_branch: 'yes',
      answers: { what_moved: 'a', tomorrow_step: 'b' },
    });
    await expect(
      services.commitment.updateCommitmentManual(userId, 'learning', {
        title: 'Rust',
        answers: { why_now: 'x', week_target: 'y', practice_plan: 'z' },
      })
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });
});
