import { describe, it, expect } from 'vitest';
import { ensureDoubleNewlinesIfMultiline, stripTrailingDotsPerLine } from '../src/domain/text-format.js';

describe('stripTrailingDotsPerLine', () => {
  it('removes trailing dots per line', () => {
    expect(stripTrailingDotsPerLine('a..\nb...')).toBe('a\nb');
  });

  it('preserves lines without trailing dots', () => {
    expect(stripTrailingDotsPerLine('x\ny')).toBe('x\ny');
  });
});

describe('ensureDoubleNewlinesIfMultiline', () => {
  it('leaves single-line text unchanged', () => {
    expect(ensureDoubleNewlinesIfMultiline('one line')).toBe('one line');
  });

  it('doubles each newline so lines are separated by a blank line', () => {
    expect(ensureDoubleNewlinesIfMultiline('a\nb')).toBe('a\n\nb');
  });

  it('does not inflate existing paragraph breaks', () => {
    expect(ensureDoubleNewlinesIfMultiline('a\n\nb')).toBe('a\n\nb');
  });
});
