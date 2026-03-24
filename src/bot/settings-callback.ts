/** Parse settings_*_time_* callback_data → HH:mm */

export function timeFromSettingsCallbackData(data: string): string | null {
  const m = data.match(/^settings_(?:declaration|fixation|report)_time_(\d{1,2})-(\d{2})$/);
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
