import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../context.js';
import { notifyDeveloper } from '../../observability/alert.js';
import type { AppContext, InlineButton, ReplyOptions } from './types.js';

/** Export for use in notifications and other callers that need Telegram keyboard from InlineButton[][]. */
export function toGrammyInlineKeyboard(rows: InlineButton[][]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) kb.row();
    for (const btn of rows[i]) {
      if (btn.callback_data) kb.text(btn.text, btn.callback_data);
      else if (btn.url) kb.url(btn.text, btn.url);
    }
  }
  return kb;
}

/** Build AppContext from grammY context (after userId middleware and session). */
export function buildAppContext(ctx: BotContext & { userId?: string }): AppContext {
  const userId = ctx.userId ?? '';
  return {
    userId,
    channel: 'telegram',
    externalId: String(ctx.from?.id ?? ''),
    session: ctx.session ?? {},
    async reply(text: string, options?: ReplyOptions) {
      const reply_markup = options?.reply_markup
        ? toGrammyInlineKeyboard(options.reply_markup)
        : undefined;
      await ctx.reply(text, { parse_mode: options?.parse_mode, reply_markup });
    },
    async answerCallbackQuery() {
      await ctx.answerCallbackQuery();
    },
    alertError(err: unknown, context: string, userId?: string) {
      notifyDeveloper(ctx.api, err, context, userId);
    },
  };
}
