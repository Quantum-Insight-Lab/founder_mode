import { describe, it, expect } from 'vitest';
import {
  ensureDoubleNewlinesIfMultiline,
  lowercaseFirstLetterAfterColonPerLine,
  stripTrailingDotsPerLine,
} from '../src/domain/text-format.js';

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

describe('lowercaseFirstLetterAfterColonPerLine', () => {
  it('lowercases first letter after colon in a line', () => {
    expect(lowercaseFirstLetterAfterColonPerLine('Фокус: Тест')).toBe('Фокус: тест');
    expect(lowercaseFirstLetterAfterColonPerLine('Result: Value')).toBe('Result: value');
    expect(lowercaseFirstLetterAfterColonPerLine('Причина: Ёжик')).toBe('Причина: ёжик');
  });

  it('does not change lines without the pattern', () => {
    expect(lowercaseFirstLetterAfterColonPerLine('без двоеточия')).toBe('без двоеточия');
    expect(lowercaseFirstLetterAfterColonPerLine('Время 19:41')).toBe('Время 19:41');
    expect(lowercaseFirstLetterAfterColonPerLine('Url: https://Example.com')).toBe('Url: https://Example.com');
    expect(lowercaseFirstLetterAfterColonPerLine('Фокус: уже строчная')).toBe('Фокус: уже строчная');
  });
});
