/**
 * Send messages to MAX messenger users (for notifications).
 * API: POST https://platform-api.max.ru/messages?user_id={user_id}
 */
import type { InlineButton } from './types.js';

const MAX_API_BASE = 'https://platform-api.max.ru';

export async function sendMaxMessage(
  token: string,
  maxUserId: string,
  text: string,
  buttons?: InlineButton[][],
  format?: 'html' | 'markdown'
): Promise<void> {
  const url = `${MAX_API_BASE}/messages?user_id=${encodeURIComponent(maxUserId)}`;
  const body: { text: string; format?: string; attachments?: unknown[] } = { text };
  if (format) body.format = format;
  if (buttons && buttons.length > 0) {
    const rows = buttons.map((row) =>
      row.map((btn) => {
        if (btn.url) {
          return { type: 'link' as const, text: btn.text, url: btn.url };
        }
        // MAX API expects "payload" (string), not "callback_data"; payload cannot be null
        const payload = (btn.callback_data ?? btn.text ?? '').toString();
        return { type: 'callback' as const, text: btn.text, payload };
      })
    );
    body.attachments = [
      {
        type: 'inline_keyboard',
        payload: { buttons: rows },
      },
    ];
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`MAX API ${res.status}: ${errText}`);
  }
}

export async function sendMaxImage(
  token: string,
  maxUserId: string,
  image: Buffer,
  filename: string,
  caption?: string,
  format?: 'html' | 'markdown'
): Promise<void> {
  const uploadRes = await fetch(`${MAX_API_BASE}/uploads?type=image`, {
    method: 'POST',
    headers: {
      Authorization: token,
    },
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`MAX uploads API ${uploadRes.status}: ${errText}`);
  }
  const uploadInfo = (await uploadRes.json()) as { url?: string };
  if (!uploadInfo.url) {
    throw new Error('MAX uploads API: missing upload url');
  }

  const form = new FormData();
  form.append('data', new Blob([new Uint8Array(image)]), filename || 'image.png');
  const putRes = await fetch(uploadInfo.url, {
    method: 'POST',
    headers: {
      Authorization: token,
    },
    body: form,
  });
  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`MAX upload file ${putRes.status}: ${errText}`);
  }
  const uploadPayload = (await putRes.json()) as Record<string, unknown>;

  const url = `${MAX_API_BASE}/messages?user_id=${encodeURIComponent(maxUserId)}`;
  const body: { text?: string; format?: string; attachments: unknown[] } = {
    attachments: [
      {
        type: 'image',
        payload: uploadPayload,
      },
    ],
  };
  if (caption) body.text = caption;
  if (format) body.format = format;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`MAX API ${res.status}: ${errText}`);
  }
}
