import { describe, it, expect } from 'vitest';
import { getAppMode, isClosureMode } from '../src/config/app-mode.js';

describe('app-mode (deprecated)', () => {
  it('always returns founder defaults', () => {
    expect(getAppMode()).toBe('founder');
    expect(isClosureMode()).toBe(false);
  });
});
