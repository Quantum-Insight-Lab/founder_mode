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

/**
 * Calendar date (YYYY-MM-DD) for an instant in the user's UTC±offset sense.
 * Same convention as getUserLocalDate (db/user-timezone).
 */
export function instantToUserLocalDateString(utcInstant: Date, offsetMin: number | null): string {
  const utcMs = utcInstant.getTime();
  if (offsetMin === null) {
    return new Date(utcMs).toISOString().slice(0, 10);
  }
  const userLocalMs = utcMs + offsetMin * 60 * 1000;
  return new Date(userLocalMs).toISOString().slice(0, 10);
}

/** Noon UTC anchor for a calendar YYYY-MM-DD (tests, legacy callers). Prefer week helpers on the string. */
export function dateStrToWeekRef(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00Z');
}
