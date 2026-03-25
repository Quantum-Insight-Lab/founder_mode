export type AvatarMode = 'uploaded' | 'messenger' | 'default';

export interface AvatarPreference {
  mode: AvatarMode;
  storageKey: string | null;
  mime: string | null;
}

export interface AvatarResolveSources {
  loadUploaded: (storageKey: string, mime?: string | null) => Promise<string | null>;
  loadMessenger: () => Promise<string | null>;
}

/** Resolves CSS background-image value by priority: uploaded -> messenger -> default. */
export async function resolveAvatarBackgroundImageValue(
  pref: AvatarPreference,
  sources: AvatarResolveSources
): Promise<string> {
  if (pref.mode === 'uploaded' && pref.storageKey) {
    const uploaded = await sources.loadUploaded(pref.storageKey, pref.mime);
    if (uploaded) return `url(${uploaded})`;
  }
  if (pref.mode !== 'default') {
    const messenger = await sources.loadMessenger();
    if (messenger) return `url(${messenger})`;
  }
  return 'none';
}
