import { mkdir, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config/index.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface AvatarStored {
  storageKey: string;
  mime: string;
  width: number;
  height: number;
  dataUrl: string;
}

function getAvatarsRoot(): string {
  const dir = config().avatars.avatars_dir || 'avatars';
  return path.resolve(process.cwd(), dir);
}

function detectMimeFromBytes(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function normalizeStorageKey(storageKey: string): string {
  const safe = path.posix.normalize(storageKey).replace(/^\/+/, '');
  if (!safe || safe.startsWith('..') || safe.includes('\\')) {
    throw new Error('Invalid avatar storage key');
  }
  return safe;
}

export async function storeNormalizedAvatar(
  userId: string,
  sourceBytes: Buffer,
  declaredMime?: string | null
): Promise<AvatarStored> {
  const cfg = config().avatars;
  const maxBytes = cfg.max_file_size_mb * 1024 * 1024;
  if (sourceBytes.length === 0) throw new Error('Avatar is empty');
  if (sourceBytes.length > maxBytes) throw new Error(`Avatar too large (>${cfg.max_file_size_mb} MB)`);

  const detected = detectMimeFromBytes(sourceBytes);
  const mime = detected ?? (declaredMime?.split(';')[0].trim().toLowerCase() || '');
  if (!ALLOWED_MIME.has(mime)) throw new Error('Unsupported avatar format');

  const img = sharp(sourceBytes, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('Invalid avatar image');
  if (Math.min(width, height) < cfg.min_side_px) {
    throw new Error(`Avatar is too small (min side ${cfg.min_side_px}px)`);
  }

  const normalizedSize = cfg.normalized_size_px;
  const out = await img
    .resize(normalizedSize, normalizedSize, { fit: 'cover', position: 'centre' })
    .webp({ quality: 92 })
    .toBuffer();

  const root = getAvatarsRoot();
  const userDir = path.join(root, userId);
  await mkdir(userDir, { recursive: true });

  const oldFiles = await readdir(userDir, { withFileTypes: true });
  for (const e of oldFiles) {
    if (e.isFile()) {
      await unlink(path.join(userDir, e.name)).catch(() => {});
    }
  }

  const version = Date.now();
  const filename = `avatar-${version}.webp`;
  const fullPath = path.join(userDir, filename);
  await writeFile(fullPath, out);

  const storageKey = path.posix.join(userId, filename);
  const storedMime = 'image/webp';
  const dataUrl = `data:${storedMime};base64,${out.toString('base64')}`;
  return {
    storageKey,
    mime: storedMime,
    width: normalizedSize,
    height: normalizedSize,
    dataUrl,
  };
}

export async function loadAvatarDataUrl(storageKey: string, fallbackMime?: string | null): Promise<string | null> {
  const safeKey = normalizeStorageKey(storageKey);
  const fullPath = path.join(getAvatarsRoot(), safeKey);
  try {
    const bytes = await readFile(fullPath);
    const detected = detectMimeFromBytes(bytes);
    const mime = detected ?? fallbackMime ?? 'image/webp';
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function deleteAvatarFiles(userId: string): Promise<void> {
  const userDir = path.join(getAvatarsRoot(), userId);
  await rm(userDir, { recursive: true, force: true });
}

export async function deleteAvatarByStorageKey(storageKey: string): Promise<void> {
  const safeKey = normalizeStorageKey(storageKey);
  const fullPath = path.join(getAvatarsRoot(), safeKey);
  await unlink(fullPath).catch(() => {});
}
