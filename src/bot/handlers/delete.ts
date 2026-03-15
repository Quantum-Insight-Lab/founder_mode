import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { logger } from '../../observability/logger.js';
import { notifyDeveloper } from '../../observability/alert.js';
import { deleteUserData } from '../../services/user-deletion.js';
import type { HandlerDeps } from './deps.js';

export function registerDeleteHandlers(bot: import('grammy').Bot<BotContext>, deps: HandlerDeps): void {
  const { pool, getUserByTgId, formatErrorForUser } = deps;

  bot.command('delete', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const user = await getUserByTgId(tgId);
    logger.info({ tgId, hasUser: !!user }, 'Command /delete');
    if (!user) {
      await ctx.reply('⚠️ Нет данных для удаления.');
      return;
    }
    ensureSession(ctx);
    ctx.session.step = 'delete_confirm';
    await ctx.reply(
      '⚠️ Удалить все данные? Планы, рефлексии, обзоры. Необратимо.',
      {
        reply_markup: new InlineKeyboard()
          .text('Да, удалить', 'delete_confirm_yes')
          .text('Нет', 'delete_confirm_no'),
      }
    );
  });

  bot.callbackQuery('delete_confirm_yes', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const user = await getUserByTgId(tgId);
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.step = undefined;
    if (!user) {
      logger.debug({ tgId }, 'Delete: user already deleted');
      await ctx.reply('⚠️ Пользователь уже удалён.');
      return;
    }
    const userId = user.user_id;
    try {
      await deleteUserData(pool, userId);
      logger.info({ userId }, 'User deletion confirmed');
      await ctx.reply('❗️ Данные удалены.');
    } catch (err) {
      logger.error({ err, userId }, 'User deletion failed');
      notifyDeveloper(ctx.api, err, 'delete', userId);
      await ctx.reply(formatErrorForUser(err));
    }
  });

  bot.callbackQuery('delete_confirm_no', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    ensureSession(ctx);
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    logger.debug({ tgId }, 'Delete cancelled');
    await ctx.reply('👌 Отменено.');
  });
}
