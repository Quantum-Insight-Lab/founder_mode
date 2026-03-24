/**
 * Full Playwright PNG pipeline (slow). Set TEST_PLAYWRIGHT=1 and run playwright:install.
 */
import { describe, it, expect } from 'vitest';
import { renderDeclarationCardPng } from '../src/services/declaration-card-render.js';

const runPlaywright = process.env.TEST_PLAYWRIGHT === '1';

describe.skipIf(!runPlaywright)('card PNG (Playwright)', () => {
  it('renders non-empty PNG buffer', async () => {
    const buf = await renderDeclarationCardPng({
      username: 'Test',
      content: 'Фокус: A\n\nРезультат: B\n\nПровал: C',
      timeHHmm: '12:00',
      avatarBackgroundImage: 'none',
    });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 8).toString('binary')).toBe('\x89PNG\r\n\x1a\n');
  });
});
