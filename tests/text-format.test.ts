import { describe, it, expect } from 'vitest';
import { stripTrailingDotsPerLine } from '../src/domain/text-format.js';

describe('stripTrailingDotsPerLine', () => {
  it('removes trailing dots per line', () => {
    expect(stripTrailingDotsPerLine('a..\nb...')).toBe('a\nb');
  });

  it('preserves lines without trailing dots', () => {
    expect(stripTrailingDotsPerLine('x\ny')).toBe('x\ny');
  });
});
