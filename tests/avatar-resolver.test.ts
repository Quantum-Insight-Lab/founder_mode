import { describe, it, expect, vi } from 'vitest';
import { resolveAvatarBackgroundImageValue } from '../src/services/avatar-resolver.js';

describe('avatar-resolver', () => {
  it('uses uploaded avatar first when available', async () => {
    const out = await resolveAvatarBackgroundImageValue(
      { mode: 'uploaded', storageKey: 'u/avatar.webp', mime: 'image/webp' },
      {
        loadUploaded: vi.fn().mockResolvedValue('data:image/webp;base64,AAA'),
        loadMessenger: vi.fn().mockResolvedValue('data:image/jpeg;base64,BBB'),
      }
    );
    expect(out).toBe('url(data:image/webp;base64,AAA)');
  });

  it('falls back to messenger when uploaded is missing', async () => {
    const out = await resolveAvatarBackgroundImageValue(
      { mode: 'uploaded', storageKey: 'u/avatar.webp', mime: 'image/webp' },
      {
        loadUploaded: vi.fn().mockResolvedValue(null),
        loadMessenger: vi.fn().mockResolvedValue('data:image/jpeg;base64,BBB'),
      }
    );
    expect(out).toBe('url(data:image/jpeg;base64,BBB)');
  });

  it('returns none in default mode even if messenger exists', async () => {
    const out = await resolveAvatarBackgroundImageValue(
      { mode: 'default', storageKey: null, mime: null },
      {
        loadUploaded: vi.fn().mockResolvedValue('data:image/webp;base64,AAA'),
        loadMessenger: vi.fn().mockResolvedValue('data:image/jpeg;base64,BBB'),
      }
    );
    expect(out).toBe('none');
  });
});
