/**
 * ISO week (Mon–Sun) in the user's Gregorian calendar (same Y-M-D as getUserLocalDate).
 * week_id = YYYYMMDD of the Monday of that week.
 */
export function getWeekId(localCalendarYmd: string): string {
  const parts = localCalendarYmd.split('-');
  if (parts.length !== 3) throw new Error(`Invalid date string: ${localCalendarYmd}`);
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const jd = new Date(Date.UTC(y, mo, d));
  const dow = jd.getUTCDay();
  const daysFromMonday = (dow + 6) % 7;
  const mon = new Date(jd);
  mon.setUTCDate(jd.getUTCDate() - daysFromMonday);
  return mon.toISOString().slice(0, 10).replace(/-/g, '');
}

export function getWeekStartEnd(localCalendarYmd: string): { start: string; end: string } {
  const mondayYmd = getWeekId(localCalendarYmd);
  const y = parseInt(mondayYmd.slice(0, 4), 10);
  const mon = parseInt(mondayYmd.slice(4, 6), 10) - 1;
  const d = parseInt(mondayYmd.slice(6, 8), 10);
  const start = new Date(Date.UTC(y, mon, d));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
