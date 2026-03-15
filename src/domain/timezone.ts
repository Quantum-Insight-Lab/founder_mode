/**
 * Timezone helpers (pure domain logic, no I/O)
 */

/**
 * Converts user's local time (HH:MM) to timezone string (UTC±N).
 * serverDate defaults to now. Returns null if invalid.
 */
export function userTimeToTimezone(
  userHours: number,
  userMinutes: number,
  serverDate: Date = new Date()
): string | null {
  if (userHours < 0 || userHours > 23 || userMinutes < 0 || userMinutes > 59) return null;
  const serverMins = serverDate.getUTCHours() * 60 + serverDate.getUTCMinutes();
  const userTotalMins = userHours * 60 + userMinutes;
  let offsetMins = userTotalMins - serverMins;
  if (offsetMins > 720) offsetMins -= 1440;
  if (offsetMins < -720) offsetMins += 1440;
  const hours = Math.floor(offsetMins / 60);
  return offsetMins >= 0 ? `UTC+${hours}` : `UTC${hours}`;
}

/** Parse "UTC+3" or "UTC-5" to offset minutes. Returns null if invalid. */
export function parseTimezoneOffset(tz: string): number | null {
  const m = tz.trim().match(/^UTC([+-])(\d+)$/);
  if (!m) return null;
  const sign = m[1] === '+' ? 1 : -1;
  const hours = parseInt(m[2], 10);
  return sign * (hours * 60);
}

/** Returns Date for getWeekId/getWeekStartEnd — noon UTC of user's local date. */
export function dateStrToWeekRef(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00Z');
}
