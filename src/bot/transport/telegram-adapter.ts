import { InlineKeyboard, InputFile } from 'grammy';
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
  const first = ctx.from?.first_name?.trim() ?? '';
  const last = ctx.from?.last_name?.trim() ?? '';
  const fullName = [first, last].filter(Boolean).join(' ').trim();
  const displayName = fullName || ctx.from?.username?.trim() || String(ctx.from?.id ?? '');
  return {
    userId,
    channel: 'telegram',
    externalId: String(ctx.from?.id ?? ''),
    displayName,
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
    async replyImage(image: Buffer, filename: string, caption?: string, options?: ReplyOptions) {
      await ctx.replyWithPhoto(new InputFile(image, filename), {
        caption,
        parse_mode: options?.parse_mode,
      });
    },
    async getAvatarDataUrl(): Promise<string | null> {
      const fromId = ctx.from?.id;
      const token = process.env.BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
      if (!fromId || !token) return null;
      try {
        const photos = await ctx.api.getUserProfilePhotos(fromId, { limit: 1 });
        const photoSet = photos.photos?.[0];
        if (!photoSet?.length) return null;
        const best = photoSet[photoSet.length - 1];
        const file = await ctx.api.getFile(best.file_id);
        if (!file.file_path) return null;
        const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
        if (!res.ok) return null;
        const bytes = await res.arrayBuffer();
        const headerType = res.headers.get('content-type')?.split(';')[0] || '';
        const ext = file.file_path.split('.').pop()?.toLowerCase() || '';
        const contentType =
          headerType.startsWith('image/')
            ? headerType
            : ext === 'png'
              ? 'image/png'
              : ext === 'webp'
                ? 'image/webp'
                : 'image/jpeg';
        const dataUrl = `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
        return dataUrl;
      } catch {
        return null;
      }
    },
    alertError(err: unknown, context: string, userId?: string) {
      notifyDeveloper(ctx.api, err, context, userId);
    },
  };
}
