import { describe, it, expect } from 'vitest';
import {
  computeRhythmScore,
  computeRhythmBreakdown,
  flow01,
  stability01,
  dayWeight,
} from '../src/domain/rhythm-score.js';

function days14(
  branches: Array<'yes' | 'no' | 'partial' | null>
): import('../src/domain/rhythm-score.js').RhythmDay[] {
  const start = '2026-03-10';
  return branches.map((branch, i) => {
    const d = new Date(start + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), branch };
  });
}

describe('rhythm-score', () => {
  it('dayWeight: yes 1, partial 0.7, no 0.4, missing 0.4', () => {
    expect(dayWeight('yes')).toBe(1);
    expect(dayWeight('partial')).toBe(0.7);
    expect(dayWeight('no')).toBe(0.4);
    expect(dayWeight(null)).toBe(0.4);
  });

  it('flow01: all yes → 1', () => {
    const d = days14(Array(14).fill('yes'));
    expect(flow01(d)).toBe(1);
  });

  it('stability: suffix 2 no → 1', () => {
    const seq = days14([...Array(12).fill('yes'), 'no', 'no'] as ('yes' | 'no')[]);
    expect(stability01(seq)).toBe(1);
  });

  it('computeRhythmScore returns 0–100', () => {
    const d = days14(Array(14).fill('yes'));
    const s = computeRhythmScore(d, true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('computeRhythmBreakdown: 14×yes + report flag → flow/completion/stability 1, score 100', () => {
    const d = days14(Array(14).fill('yes'));
    const b = computeRhythmBreakdown(d, true);
    expect(b.flow).toBe(1);
    expect(b.completion).toBe(1);
    expect(b.stability).toBe(1);
    expect(b.score).toBe(100);
    expect(computeRhythmScore(d, true)).toBe(b.score);
  });

  it('computeRhythmBreakdown: 14×no + no report → low score, components consistent', () => {
    const d = days14(Array(14).fill('no'));
    const b = computeRhythmBreakdown(d, false);
    expect(b.flow).toBe(0);
    expect(b.completion).toBe(0);
    expect(b.stability).toBe(0);
    expect(b.score).toBe(0);
  });
});
