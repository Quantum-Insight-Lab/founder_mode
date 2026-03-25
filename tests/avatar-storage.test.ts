import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { deleteAvatarFiles, loadAvatarDataUrl, storeNormalizedAvatar } from '../src/services/avatar-storage.js';

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 50, g: 100, b: 150 },
    },
  })
    .png()
    .toBuffer();
}

describe('avatar-storage', () => {
  it('stores normalized avatar and loads it as data URL', async () => {
    const userId = randomUUID();
    const source = await makePng(900, 600);
    const stored = await storeNormalizedAvatar(userId, source, 'image/png');
    expect(stored.storageKey).toContain(`${userId}/avatar-`);
    expect(stored.mime).toBe('image/webp');
    expect(stored.width).toBe(512);
    expect(stored.height).toBe(512);
    expect(stored.dataUrl.startsWith('data:image/webp;base64,')).toBe(true);

    const loaded = await loadAvatarDataUrl(stored.storageKey, stored.mime);
    expect(loaded?.startsWith('data:image/webp;base64,')).toBe(true);

    await deleteAvatarFiles(userId);
    const afterDelete = await loadAvatarDataUrl(stored.storageKey, stored.mime);
    expect(afterDelete).toBeNull();
  });

  it('rejects unsupported image format', async () => {
    const userId = randomUUID();
    await expect(storeNormalizedAvatar(userId, Buffer.from('not-image-data'))).rejects.toThrow(
      /Unsupported avatar format/
    );
  });

  it('rejects too small image', async () => {
    const userId = randomUUID();
    const tiny = await makePng(128, 128);
    await expect(storeNormalizedAvatar(userId, tiny, 'image/png')).rejects.toThrow(
      /too small/
    );
  });
});
