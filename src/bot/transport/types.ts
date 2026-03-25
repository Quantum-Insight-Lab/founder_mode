import type { SessionData } from '../context.js';

export type Channel = 'telegram' | 'max';

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface ReplyOptions {
  parse_mode?: 'HTML';
  reply_markup?: InlineButton[][];
}

export interface AppContext {
  userId: string;
  channel: Channel;
  externalId: string;
  displayName?: string;
  session: SessionData;
  reply(text: string, options?: ReplyOptions): Promise<void>;
  replyImage?(image: Buffer, filename: string, caption?: string, options?: ReplyOptions): Promise<void>;
  getAvatarDataUrl?(): Promise<string | null>;
  answerCallbackQuery(): Promise<void>;
  editMessageText?(text: string, options?: ReplyOptions): Promise<void>;
  /** Optional: notify developer (e.g. Telegram alert). */
  alertError?(err: unknown, context: string, userId?: string): void;
}

export type IncomingEvent =
  | { type: 'command'; name: string }
  | { type: 'callback'; data: string }
  | { type: 'message'; text: string }
  | { type: 'photo'; bytes: Buffer; mime: string; filename?: string };
