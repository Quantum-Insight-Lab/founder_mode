import { describe, it, expect } from 'vitest';
import { matterAreaLabel, MATTER_AREAS } from '../src/bot/closure-conversations.js';

describe('matterAreaLabel', () => {
  it('returns preset label for known key', () => {
    expect(matterAreaLabel('health')).toBe('Здоровье');
  });

  it('returns custom text for other', () => {
    expect(matterAreaLabel('other', 'переезд родителей')).toBe('переезд родителей');
  });

  it('falls back when other without custom', () => {
    expect(matterAreaLabel('other', '')).toBe('Другое');
  });

  it('includes other in button areas', () => {
    expect(MATTER_AREAS.some((a) => a.key === 'other')).toBe(true);
    expect(MATTER_AREAS.length).toBeGreaterThanOrEqual(10);
  });
});
