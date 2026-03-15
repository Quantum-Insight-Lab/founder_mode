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
  session: SessionData;
  reply(text: string, options?: ReplyOptions): Promise<void>;
  answerCallbackQuery(): Promise<void>;
  editMessageText?(text: string, options?: ReplyOptions): Promise<void>;
  /** Optional: notify developer (e.g. Telegram alert). */
  alertError?(err: unknown, context: string, userId?: string): void;
}

export type IncomingEvent =
  | { type: 'command'; name: string }
  | { type: 'callback'; data: string }
  | { type: 'message'; text: string };
