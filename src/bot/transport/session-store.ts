import type { SessionData } from '../context.js';

/** Evict sessions idle longer than this (touch on read/write). */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

const store = new Map<string, { data: SessionData; at: number }>();

function touch(key: string): void {
  const e = store.get(key);
  if (e) e.at = Date.now();
}

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.at > SESSION_TTL_MS) store.delete(k);
  }
}

if (typeof setInterval !== 'undefined') {
  const t = setInterval(prune, CLEANUP_INTERVAL_MS);
  t.unref?.();
}

export function createSessionStore(): {
  get(key: string): SessionData | undefined;
  set(key: string, value: SessionData): void;
  delete(key: string): void;
} {
  return {
    get(key: string) {
      const e = store.get(key);
      if (!e) return undefined;
      touch(key);
      return e.data;
    },
    set(key: string, value: SessionData) {
      store.set(key, { data: value, at: Date.now() });
    },
    delete(key: string) {
      store.delete(key);
    },
  };
}

/** grammY StorageAdapter for session keyed by user_id */
export function createGrammySessionStorage(
  store: ReturnType<typeof createSessionStore>
): {
  read: (key: string) => Promise<SessionData | undefined>;
  write: (key: string, value: SessionData) => Promise<void>;
  delete: (key: string) => Promise<void>;
} {
  return {
    async read(key: string) {
      return store.get(key);
    },
    async write(key: string, value: SessionData) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}
