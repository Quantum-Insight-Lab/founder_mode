import type { SessionData } from '../context.js';

const store = new Map<string, SessionData>();

export function createSessionStore(): {
  get(key: string): SessionData | undefined;
  set(key: string, value: SessionData): void;
  delete(key: string): void;
} {
  return {
    get(key: string) {
      return store.get(key);
    },
    set(key: string, value: SessionData) {
      store.set(key, value);
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
