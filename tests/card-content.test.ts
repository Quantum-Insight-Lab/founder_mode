import { describe, it, expect } from 'vitest';
import { stripLeadingCardHeadings } from '../src/domain/card-content.js';

describe('stripLeadingCardHeadings', () => {
  it('removes duplicated fixation title', () => {
    expect(
      stripLeadingCardHeadings('Фиксация дня\n\nДвижение: тест', ['Фиксация дня'])
    ).toBe('Движение: тест');
  });

  it('removes title with colon prefix', () => {
    expect(
      stripLeadingCardHeadings('Приоритет недели: фокус', ['Приоритет недели'])
    ).toBe('фокус');
  });

  it('leaves content unchanged when no duplicate', () => {
    expect(stripLeadingCardHeadings('Только тело', ['Фиксация дня'])).toBe('Только тело');
  });
});
