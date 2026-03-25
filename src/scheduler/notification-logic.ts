/**
 * Pure helpers for notification scheduling (timezone → local clock, time windows).
 */
import { getWeekId } from '../services/week-service.js';

export function computeUserLocalNotificationClock(
  now: Date,
  offsetMinutes: number
): { userDay: number; userMins: number; userDateStr: string; userWeekId: string } {
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const utcDay = now.getUTCDay();
  const off = offsetMinutes;
  let totalMins = utcMins + off;
  let dayOffset = 0;
  if (totalMins < 0) {
    totalMins += 1440;
    dayOffset = -1;
  } else if (totalMins >= 1440) {
    totalMins -= 1440;
    dayOffset = 1;
  }
  const userDay = (utcDay + dayOffset + 7) % 7;
  const userMins = totalMins;
  const userLocalMs = now.getTime() + off * 60 * 1000;
  const userDateStr = new Date(userLocalMs).toISOString().slice(0, 10);
  const userWeekId = getWeekId(userDateStr);
  return { userDay, userMins, userDateStr, userWeekId };
}

export function matchesNotificationTimeInWindow(
  userDay: number,
  userMins: number,
  targetDay: number | null,
  targetTime: string | null,
  windowMin: number
): boolean {
  if (targetDay == null || !targetTime) return false;
  const [th, tm] = targetTime.split(':').map((x) => parseInt(x, 10));
  const targetMins = th * 60 + tm;
  return (
    userDay === targetDay &&
    userMins >= targetMins - windowMin &&
    userMins <= targetMins + windowMin
  );
}

export function matchesFixationNotificationWindow(
  userDay: number,
  userMins: number,
  fixationNotifyDays: string | null,
  fixationNotifyTime: string | null,
  windowMin: number
): boolean {
  if (!fixationNotifyDays || !fixationNotifyTime) return false;
  const days = fixationNotifyDays.split(',').map((x) => parseInt(x.trim(), 10));
  if (!days.includes(userDay)) return false;
  const [th, tm] = fixationNotifyTime.split(':').map((x) => parseInt(x, 10));
  const targetMins = th * 60 + tm;
  return userMins >= targetMins - windowMin && userMins <= targetMins + windowMin;
}

/** Sunday 12:00 local, onboarding report invite slot. */
export function isOnboardingSundayReportInviteSlot(
  userDay: number,
  userMins: number,
  windowMin: number
): boolean {
  if (userDay !== 0) return false;
  const targetMins = 12 * 60;
  return userMins >= targetMins - windowMin && userMins <= targetMins + windowMin;
}
