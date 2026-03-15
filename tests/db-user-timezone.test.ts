import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserLocalDate } from '../src/db/user-timezone.js';

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

describe('db/user-timezone', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns user local date when timezone set', async () => {
    mockQuery.mockResolvedValue({ rows: [{ timezone: 'UTC+3' }] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z')); // noon UTC

    const result = await getUserLocalDate('user-1', mockPool as never);

    expect(result).toBe('2026-03-09'); // UTC+3 15:00 = same calendar day
    vi.useRealTimers();
  });

  it('returns UTC date when no timezone', async () => {
    mockQuery.mockResolvedValue({ rows: [{ timezone: null }] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T23:00:00Z'));

    const result = await getUserLocalDate('user-1', mockPool as never);

    expect(result).toBe('2026-03-09');
    vi.useRealTimers();
  });

  it('returns UTC date when user_settings row empty', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z'));

    const result = await getUserLocalDate('user-1', mockPool as never);

    expect(result).toBe('2026-03-09');
    vi.useRealTimers();
  });
});
