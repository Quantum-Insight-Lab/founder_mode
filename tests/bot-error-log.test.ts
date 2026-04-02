import { describe, it, expect } from 'vitest';
import { botCatchErrorForLog } from '../src/observability/bot-error-log.js';

describe('botCatchErrorForLog', () => {
  it('extracts messages without embedding ctx', () => {
    const inner = new Error('column missing');
    const err = {
      message: 'error in middleware',
      error: inner,
      ctx: { api: { token: 'SECRET' }, from: { id: 42 } },
    };
    const log = botCatchErrorForLog(err);
    expect(JSON.stringify(log)).not.toContain('SECRET');
    expect(log.causeMessage).toBe('column missing');
    expect(log.telegramUserId).toBe(42);
  });
});
