import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import type { ProductMode } from '../../services/product-mode.js';
import { productModeLabel } from '../../services/product-mode.js';
import { getModeConfig } from '../../modes/registry.js';
import { botOpens } from '../../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import {
  PRODUCT_MODE_PICKER_TEXT,
  productModeSwitchedText,
  SETTINGS_PRODUCT_MODE,
} from '../product-mode-copy.js';
import type { HandlerDeps } from './deps.js';
import {
  handleEngineStart,
  handleEngineOnboardCtaYes,
  handleEngineOnboardCtaLater,
  handleEngineOnboardNotifOff,
  handleEngineOnboardTimezone,
  handleEngineOnboardDigestCtaYes,
  handleEngineOnboardDigestCtaLater,
} from './engine/onboarding.js';

const MODE_PICKER_MARKUP: import('../transport/types.js').InlineButton[][] = [
  [
    { text: 'Closure', callback_data: 'product_mode_closure' },
    { text: 'Startup', callback_data: 'product_mode_startup' },
  ],
  [{ text: 'Learning', callback_data: 'product_mode_learning' }],
  [
    { text: 'Work', callback_data: 'product_mode_work' },
    { text: 'Job hunt', callback_data: 'product_mode_jobhunt' },
  ],
  [{ text: 'Quit', callback_data: 'product_mode_quit' }],
];

const SETTINGS_MODE_MARKUP: import('../transport/types.js').InlineButton[][] = [
  [
    { text: 'Closure', callback_data: 'product_mode_set_closure' },
    { text: 'Startup', callback_data: 'product_mode_set_startup' },
  ],
  [{ text: 'Learning', callback_data: 'product_mode_set_learning' }],
  [
    { text: 'Work', callback_data: 'product_mode_set_work' },
    { text: 'Job hunt', callback_data: 'product_mode_set_jobhunt' },
  ],
  [{ text: 'Quit', callback_data: 'product_mode_set_quit' }],
  [{ text: 'Назад', callback_data: 'settings_product_mode_back' }],
];

export async function runModeStart(ctx: AppContext, deps: HandlerDeps, mode: ProductMode): Promise<void> {
  await handleEngineStart(ctx, deps, mode, getModeConfig(mode), { skipBotOpen: true });
}

export async function handleUnifiedStart(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  botOpens.inc();
  const userId = ctx.userId;
  const mode = await deps.getUserProductMode(userId);
  logger.info({ channel: ctx.channel, userId, mode }, 'Command /start');
  if (!mode) {
    ensureSession(ctx);
    ctx.session.step = 'product_mode_pick';
    await ctx.reply(PRODUCT_MODE_PICKER_TEXT, { parse_mode: 'HTML', reply_markup: MODE_PICKER_MARKUP });
    return;
  }
  await runModeStart(ctx, deps, mode);
}

export async function handleProductModePick(ctx: AppContext, mode: ProductMode, deps: HandlerDeps): Promise<void> {
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  await deps.setUserProductMode(userId, mode);
  ensureSession(ctx);
  ctx.session.step = undefined;
  logger.info({ userId, mode }, 'Product mode selected');
  await runModeStart(ctx, deps, mode);
}

export async function handleSettingsProductModeMenu(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  const mode = await deps.getUserProductMode(userId);
  const text = `<b>${SETTINGS_PRODUCT_MODE}</b>: ${productModeLabel(mode)}`;
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: SETTINGS_MODE_MARKUP });
}

export async function handleProductModeSet(ctx: AppContext, mode: ProductMode, deps: HandlerDeps): Promise<void> {
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  await deps.setUserProductMode(userId, mode);
  logger.info({ userId, mode }, 'Product mode switched from settings');
  const switched = productModeSwitchedText(mode);
  const intro = getModeConfig(mode).onboarding.intro;
  await ctx.reply(`${switched}\n\n${intro}`, { parse_mode: 'HTML' });
}

export async function handleSettingsProductModeBack(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  await deps.showSettingsMenu(ctx, ctx.userId);
}

export function registerProductModeHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('start', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleUnifiedStart(appCtx, deps);
  });

  const pick = (mode: ProductMode) => async (ctx: BotContext) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModePick(appCtx, mode, deps);
  };
  const set = (mode: ProductMode) => async (ctx: BotContext) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, mode, deps);
  };

  bot.callbackQuery('product_mode_closure', pick('closure'));
  bot.callbackQuery('product_mode_startup', pick('startup'));
  bot.callbackQuery('product_mode_learning', pick('learning'));
  bot.callbackQuery('product_mode_jobhunt', pick('jobhunt'));
  bot.callbackQuery('product_mode_work', pick('work'));
  bot.callbackQuery('product_mode_quit', pick('quit'));
  bot.callbackQuery('product_mode_set_closure', set('closure'));
  bot.callbackQuery('product_mode_set_startup', set('startup'));
  bot.callbackQuery('product_mode_set_learning', set('learning'));
  bot.callbackQuery('product_mode_set_jobhunt', set('jobhunt'));
  bot.callbackQuery('product_mode_set_work', set('work'));
  bot.callbackQuery('product_mode_set_quit', set('quit'));
  bot.callbackQuery('settings_product_mode', async (ctx) => {
    await handleSettingsProductModeMenu(buildAppContext(ctx as BotContext & { userId?: string }), deps);
  });
  bot.callbackQuery('settings_product_mode_back', async (ctx) => {
    await handleSettingsProductModeBack(buildAppContext(ctx as BotContext & { userId?: string }), deps);
  });

  bot.callbackQuery('onboard_cta_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    const mode = await deps.getUserProductMode(appCtx.userId);
    if (!mode) return appCtx.reply('Сначала выбери режим: /start');
    await handleEngineOnboardCtaYes(appCtx, deps, getModeConfig(mode));
  });
  bot.callbackQuery('onboard_cta_later', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    const mode = await deps.getUserProductMode(appCtx.userId);
    if (!mode) return appCtx.reply('Сначала выбери режим: /start');
    await handleEngineOnboardCtaLater(appCtx, deps, getModeConfig(mode));
  });
  bot.callbackQuery('onboard_notif_off', async (ctx) => {
    await handleEngineOnboardNotifOff(buildAppContext(ctx as BotContext & { userId?: string }), deps);
  });
  bot.callbackQuery('onboard_digest_cta_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    const mode = await deps.getUserProductMode(appCtx.userId);
    if (!mode) return appCtx.reply('Сначала выбери режим: /start');
    await handleEngineOnboardDigestCtaYes(appCtx, deps, getModeConfig(mode));
  });
  bot.callbackQuery('onboard_digest_cta_later', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    const mode = await deps.getUserProductMode(appCtx.userId);
    if (!mode) return appCtx.reply('Сначала выбери режим: /start');
    await handleEngineOnboardDigestCtaLater(appCtx, deps, getModeConfig(mode));
  });

  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'onboard_timezone' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      const mode = await deps.getUserProductMode(appCtx.userId);
      if (!mode) return appCtx.reply('Сначала выбери режим: /start');
      await handleEngineOnboardTimezone(appCtx, ctx.message.text?.trim() ?? '', deps, getModeConfig(mode));
    }
  );
}
