import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { applyAllMigrations } from './apply-migrations.js';
import { createSettingsService } from '../src/services/settings-service.js';
import {
  getUserProductMode,
  setUserProductMode,
  productModeLabel,
  isClosureProductMode,
} from '../src/services/product-mode.js';
import { notificationCopyForMode } from '../src/scheduler/notification-copy.js';
import { idleCommandListForMode } from '../src/bot/idle-for-mode.js';
import { IDLE_COMMAND_LIST_REPLY } from '../src/bot/idle-message.js';
import { CLOSURE_IDLE_COMMAND_LIST_REPLY } from '../src/bot/closure-idle-message.js';
import { withProductMode } from '../src/bot/with-product-mode.js';
import { wrongProductModeHint, PRODUCT_MODE_PICK_FIRST } from '../src/bot/product-mode-copy.js';
import {
  handleUnifiedStart,
  handleProductModePick,
} from '../src/bot/handlers/product-mode.js';
import type { AppContext } from '../src/bot/transport/types.js';
import type { HandlerDeps } from '../src/bot/handlers/deps.js';
import { PRODUCT_MODE_PICKER_TEXT } from '../src/bot/product-mode-copy.js';

const dbUrl = process.env.TEST_DATABASE_URL;

describe('product-mode helpers', () => {
  it('labels modes', () => {
    expect(productModeLabel('founder')).toBe('Founder Mode');
    expect(productModeLabel('closure')).toBe('Closure');
    expect(productModeLabel(null)).toBe('—');
  });

  it('notification copy per mode', () => {
    const founder = notificationCopyForMode('founder');
    expect(founder.declarationCallback).toBe('notify_declaration');
    expect(founder.declarationText).toContain('declaration');

    const closure = notificationCopyForMode('closure');
    expect(closure.stepCallback).toBe('notify_step');
    expect(closure.digestText).toContain('дайджест');
  });

  it('idle list per mode', () => {
    expect(idleCommandListForMode('founder')).toBe(IDLE_COMMAND_LIST_REPLY);
    expect(idleCommandListForMode('closure')).toBe(CLOSURE_IDLE_COMMAND_LIST_REPLY);
    expect(idleCommandListForMode(null)).toBe(IDLE_COMMAND_LIST_REPLY);
  });

  it('wrong mode hints', () => {
    expect(wrongProductModeHint(null, 'founder')).toBe(PRODUCT_MODE_PICK_FIRST);
    expect(wrongProductModeHint('closure', 'founder')).toContain('Founder');
  });

  it('withProductMode blocks wrong mode', async () => {
    const replies: string[] = [];
    const ctx = {
      userId: 'u1',
      async reply(text: string) {
        replies.push(text);
      },
    } as unknown as AppContext;
    const deps = {
      getUserProductMode: async () => 'closure' as const,
    } as HandlerDeps;
    const handler = vi.fn();
    await withProductMode('founder', handler)(ctx, deps);
    expect(handler).not.toHaveBeenCalled();
    expect(replies[0]).toContain('Founder');
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
    const ctx = mockCtx(replies);
    const deps = {
      getUserProductMode: async () => null,
      setUserProductMode: vi.fn(),
    } as unknown as HandlerDeps;
    await handleUnifiedStart(ctx, deps);
    expect(replies[0]).toBe(PRODUCT_MODE_PICKER_TEXT);
  });

  it('product mode pick saves and starts onboarding', async () => {
    const replies: string[] = [];
    const ctx = mockCtx(replies);
    const setMode = vi.fn();
    const deps = {
      getUserProductMode: async () => null,
      setUserProductMode: setMode,
      pool: { query: vi.fn().mockResolvedValue({ rows: [{ onboarding_started_at: null, onboarding_completed_at: null }] }) },
    } as unknown as HandlerDeps;
    await handleProductModePick(ctx, 'founder', deps);
    expect(setMode).toHaveBeenCalledWith('u1', 'founder');
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
    expect(await settings.getProductMode(userId)).toBeNull();
    await settings.setProductMode(userId, 'closure');
    expect(await settings.getProductMode(userId)).toBe('closure');
    const row = await settings.get(userId);
    expect(row?.product_mode).toBe('closure');
  });

  it('getUserProductMode from product-mode service', async () => {
    expect(await getUserProductMode(pool, userId)).toBeNull();
    await setUserProductMode(pool, userId, 'founder');
    expect(await getUserProductMode(pool, userId)).toBe('founder');
    expect(isClosureProductMode(await getUserProductMode(pool, userId))).toBe(false);
  });
});
