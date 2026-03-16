import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import { logger } from '../../observability/logger.js';
import { deleteUserData } from '../../services/user-deletion.js';
import type { HandlerDeps } from './deps.js';

export async function handleDeleteCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { getUserByTgId, getUserByMaxId } = deps;
  const user = ctx.channel === 'telegram'
    ? await getUserByTgId(ctx.externalId)
    : await getUserByMaxId(ctx.externalId);
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, hasUser: !!user }, 'Command /delete');
  if (!user) {
    await ctx.reply('⚠️ Нет данных для удаления.');
    return;
  }
  ensureSession(ctx);
  ctx.session.step = 'delete_confirm';
  await ctx.reply('⚠️ Удалить все данные? Планы, рефлексии, обзоры. Необратимо.', {
    reply_markup: [[
      { text: 'Да, удалить', callback_data: 'delete_confirm_yes' },
      { text: 'Нет', callback_data: 'delete_confirm_no' },
    ]],
  });
}

export async function handleDeleteConfirmYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, getUserByTgId, getUserByMaxId, formatErrorForUser } = deps;
  const user = ctx.channel === 'telegram'
    ? await getUserByTgId(ctx.externalId)
    : await getUserByMaxId(ctx.externalId);
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  if (!user) {
    logger.debug({ channel: ctx.channel, externalId: ctx.externalId }, 'Delete: user already deleted');
    await ctx.reply('⚠️ Пользователь уже удалён.');
    return;
  }
  const userId = user.user_id;
  try {
    await deleteUserData(pool, userId);
    logger.info({ userId }, 'User deletion confirmed');
    await ctx.reply('❗️ Данные удалены. Начать заново командой /start');
  } catch (err) {
    logger.error({ err, userId }, 'User deletion failed');
    ctx.alertError?.(err, 'delete', userId);
    await ctx.reply(formatErrorForUser(err));
  }
}

export async function handleDeleteConfirmNo(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = undefined;
  await ctx.answerCallbackQuery();
  logger.debug({ channel: ctx.channel, externalId: ctx.externalId }, 'Delete cancelled');
  await ctx.reply('👌 Отменено.');
}

export function registerDeleteHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('delete', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleDeleteCommand(appCtx, deps);
  });
  bot.callbackQuery('delete_confirm_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleDeleteConfirmYes(appCtx, deps);
  });
  bot.callbackQuery('delete_confirm_no', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleDeleteConfirmNo(appCtx, deps);
  });
}
