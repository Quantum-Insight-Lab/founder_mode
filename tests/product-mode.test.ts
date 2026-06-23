import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { applyAllMigrations } from './apply-migrations.js';
import { createSettingsService } from '../src/services/settings-service.js';
import {
  getUserProductMode,
  setUserProductMode,
  productModeLabel,
  isEngineMode,
  ENGINE_MODES,
} from '../src/services/product-mode.js';
import { notificationCopyForMode } from '../src/scheduler/notification-copy.js';
import { idleCommandListForMode } from '../src/bot/idle-for-mode.js';
import { getModeConfig, MODE_CONFIGS } from '../src/modes/registry.js';
import { withEngineMode } from '../src/bot/with-engine-mode.js';
import { PRODUCT_MODE_PICK_FIRST } from '../src/bot/product-mode-copy.js';
import { handleUnifiedStart, handleProductModePick } from '../src/bot/handlers/product-mode.js';
import type { AppContext } from '../src/bot/transport/types.js';
import type { HandlerDeps } from '../src/bot/handlers/deps.js';
import { PRODUCT_MODE_PICKER_TEXT } from '../src/bot/product-mode-copy.js';

const dbUrl = process.env.TEST_DATABASE_URL;

describe('product-mode helpers', () => {
  it('labels modes', () => {
    expect(productModeLabel('closure')).toBe('Closure');
    expect(productModeLabel('learning')).toBe('Learning');
    expect(productModeLabel('startup')).toBe('Startup');
    expect(productModeLabel(null)).toBe('—');
  });

  it('isEngineMode for all engine modes', () => {
    for (const mode of ENGINE_MODES) expect(isEngineMode(mode)).toBe(true);
    expect(isEngineMode(null)).toBe(false);
  });

  it('all modes have pivot with 3 questions', () => {
    for (const mode of ENGINE_MODES) {
      expect(MODE_CONFIGS[mode].switchFlow.questions).toHaveLength(3);
    }
  });

  it('notification copy per mode', () => {
    const closure = notificationCopyForMode('closure');
    expect(closure.stepCallback).toBe('notify_log');
    expect(closure.digestText).toContain('recap');
    const learning = notificationCopyForMode('learning');
    expect(learning.declarationCallback).toBe('notify_focus');
  });

  it('idle list per mode', () => {
    expect(idleCommandListForMode('closure')).toBe(getModeConfig('closure').idleReply);
    expect(idleCommandListForMode(null)).toBe(PRODUCT_MODE_PICK_FIRST);
  });

  it('withEngineMode blocks when mode unset', async () => {
    const replies: string[] = [];
    const ctx = {
      userId: 'u1',
      async reply(text: string) {
        replies.push(text);
      },
    } as unknown as AppContext;
    const deps = { getUserProductMode: async () => null } as HandlerDeps;
    const handler = vi.fn();
    await withEngineMode(handler)(ctx, deps);
    expect(handler).not.toHaveBeenCalled();
    expect(replies[0]).toBe(PRODUCT_MODE_PICK_FIRST);
  });
});

describe('product-mode handlers (unit)', () => {
  function mockCtx(replies: string[]) {
    return {
      userId: 'u1',
      channel: 'telegram' as const,
      externalId: '1',
      session: {},
      async reply(text: string) {
        replies.push(text);
      },
      async answerCallbackQuery() {},
    } as unknown as AppContext;
  }

  it('first /start shows picker when mode unset', async () => {
    const replies: string[] = [];
    const deps = {
      getUserProductMode: async () => null,
      setUserProductMode: vi.fn(),
    } as unknown as HandlerDeps;
    await handleUnifiedStart(mockCtx(replies), deps);
    expect(replies[0]).toBe(PRODUCT_MODE_PICKER_TEXT);
  });

  it('product mode pick saves mode', async () => {
    const setMode = vi.fn();
    const deps = {
      getUserProductMode: async () => null,
      setUserProductMode: setMode,
      pool: { query: vi.fn().mockResolvedValue({ rows: [{ onboarding_started_at: null, onboarding_completed_at: null }] }) },
    } as unknown as HandlerDeps;
    await handleProductModePick(mockCtx([]), 'learning', deps);
    expect(setMode).toHaveBeenCalledWith('u1', 'learning');
  });
});

describe.skipIf(!dbUrl)('product-mode settings-service', () => {
  let pool: Pool;
  const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await applyAllMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2)', [userId, 'pm-test']);
  });

  it('get/set product_mode via settings service', async () => {
    const settings = createSettingsService(pool);
    await settings.setProductMode(userId, 'closure');
    expect(await settings.getProductMode(userId)).toBe('closure');
  });

  it('getUserProductMode from product-mode service', async () => {
    await setUserProductMode(pool, userId, 'startup');
    expect(await getUserProductMode(pool, userId)).toBe('startup');
    expect(isEngineMode(await getUserProductMode(pool, userId))).toBe(true);
  });
});
