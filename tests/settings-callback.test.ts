import { describe, it, expect } from 'vitest';
import { timeFromSettingsCallbackData } from '../src/bot/settings-callback.js';

describe('timeFromSettingsCallbackData', () => {
  it('parses declaration time callback', () => {
    expect(timeFromSettingsCallbackData('settings_declaration_time_09-30')).toBe('09:30');
  });

  it('parses fixation and report', () => {
    expect(timeFromSettingsCallbackData('settings_fixation_time_14-00')).toBe('14:00');
    expect(timeFromSettingsCallbackData('settings_report_time_23-45')).toBe('23:45');
  });

  it('returns null for unknown or invalid payload', () => {
    expect(timeFromSettingsCallbackData('notify_fixation')).toBeNull();
    expect(timeFromSettingsCallbackData('settings_report_time_24-00')).toBeNull();
    expect(timeFromSettingsCallbackData('settings_fixation_time_12-99')).toBeNull();
    expect(timeFromSettingsCallbackData('settings_declaration_time_12-30-00')).toBeNull();
  });
});
