import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import type { ProductMode } from '../../services/product-mode.js';
import { isEngineMode, productModeLabel } from '../../services/product-mode.js';
import { getModeConfig } from '../../modes/registry.js';
import type { ModeConfig } from '../../modes/types.js';
import { botOpens } from '../../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import { ONBOARDING_INTRO } from '../conversations.js';
import {
  PRODUCT_MODE_PICKER_TEXT,
  productModeSwitchedText,
  SETTINGS_PRODUCT_MODE,
} from '../product-mode-copy.js';
import type { HandlerDeps } from './deps.js';
import { handleStart } from './onboarding.js';
import {
  handleOnboardCtaYes,
  handleOnboardCtaLater,
  handleOnboardNotifOff,
  handleOnboardTimezone,
  handleOnboardReportCtaYes,
  handleOnboardReportCtaLater,
} from './onboarding.js';
import {
  handleEngineStart,
  handleEngineOnboardCtaYes,
  handleEngineOnboardCtaLater,
  handleEngineOnboardNotifOff,
  handleEngineOnboardTimezone,
} from './engine/onboarding.js';

const MODE_PICKER_MARKUP: import('../transport/types.js').InlineButton[][] = [
  [
    { text: 'Founder Mode', callback_data: 'product_mode_founder' },
    { text: 'Closure', callback_data: 'product_mode_closure' },
  ],
  [
    { text: 'Startup', callback_data: 'product_mode_startup' },
    { text: 'Learning', callback_data: 'product_mode_learning' },
  ],
  [
    { text: 'Habit', callback_data: 'product_mode_habit' },
    { text: 'Work', callback_data: 'product_mode_work' },
  ],
  [
    { text: 'Job hunt', callback_data: 'product_mode_jobhunt' },
    { text: 'Quit', callback_data: 'product_mode_quit' },
  ],
];

const SETTINGS_MODE_MARKUP: import('../transport/types.js').InlineButton[][] = [
  [
    { text: 'Founder Mode', callback_data: 'product_mode_set_founder' },
    { text: 'Closure', callback_data: 'product_mode_set_closure' },
  ],
  [
    { text: 'Startup', callback_data: 'product_mode_set_startup' },
    { text: 'Learning', callback_data: 'product_mode_set_learning' },
  ],
  [
    { text: 'Habit', callback_data: 'product_mode_set_habit' },
    { text: 'Work', callback_data: 'product_mode_set_work' },
  ],
  [
    { text: 'Job hunt', callback_data: 'product_mode_set_jobhunt' },
    { text: 'Quit', callback_data: 'product_mode_set_quit' },
  ],
  [{ text: 'Назад', callback_data: 'settings_product_mode_back' }],
];

export async function runModeStart(ctx: AppContext, deps: HandlerDeps, mode: ProductMode): Promise<void> {
  if (isEngineMode(mode)) {
    await handleEngineStart(ctx, deps, mode, getModeConfig(mode), { skipBotOpen: true });
  } else {
    await handleStart(ctx, deps, { skipBotOpen: true });
  }
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
  const intro = isEngineMode(mode) ? getModeConfig(mode).onboarding.intro : ONBOARDING_INTRO;
  await ctx.reply(`${switched}\n\n${intro}`, { parse_mode: 'HTML' });
}

export async function handleSettingsProductModeBack(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  await deps.showSettingsMenu(ctx, ctx.userId);
}

interface OnboardHandlers {
  founder: () => Promise<void>;
  engine: (config: ModeConfig) => Promise<void>;
}

async function routeOnboardByMode(ctx: AppContext, deps: HandlerDeps, handlers: OnboardHandlers): Promise<void> {
  const mode = await deps.getUserProductMode(ctx.userId);
  if (!mode) {
    await ctx.reply('Сначала выбери режим: /start');
    return;
  }
  if (isEngineMode(mode)) {
    await handlers.engine(getModeConfig(mode));
    return;
  }
  await handlers.founder();
}

export function registerProductModeHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('start', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleUnifiedStart(appCtx, deps);
  });

  bot.callbackQuery('product_mode_founder', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModePick(appCtx, 'founder', deps);
  });
  bot.callbackQuery('product_mode_closure', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModePick(appCtx, 'closure', deps);
  });
  bot.callbackQuery('product_mode_learning', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModePick(appCtx, 'learning', deps);
  });
  bot.callbackQuery('product_mode_startup', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModePick(appCtx, 'startup', deps);
  });
  bot.callbackQuery('product_mode_habit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModePick(appCtx, 'habit', deps);
  });
  bot.callbackQuery('product_mode_jobhunt', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModePick(appCtx, 'jobhunt', deps);
  });
  bot.callbackQuery('product_mode_work', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModePick(appCtx, 'work', deps);
  });
  bot.callbackQuery('product_mode_quit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModePick(appCtx, 'quit', deps);
  });
  bot.callbackQuery('product_mode_set_founder', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, 'founder', deps);
  });
  bot.callbackQuery('product_mode_set_closure', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, 'closure', deps);
  });
  bot.callbackQuery('product_mode_set_learning', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, 'learning', deps);
  });
  bot.callbackQuery('product_mode_set_startup', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, 'startup', deps);
  });
  bot.callbackQuery('product_mode_set_habit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, 'habit', deps);
  });
  bot.callbackQuery('product_mode_set_jobhunt', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, 'jobhunt', deps);
  });
  bot.callbackQuery('product_mode_set_work', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, 'work', deps);
  });
  bot.callbackQuery('product_mode_set_quit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, 'quit', deps);
  });
  bot.callbackQuery('settings_product_mode', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsProductModeMenu(appCtx, deps);
  });
  bot.callbackQuery('settings_product_mode_back', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsProductModeBack(appCtx, deps);
  });

  bot.callbackQuery('onboard_cta_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await routeOnboardByMode(appCtx, deps, {
      founder: () => handleOnboardCtaYes(appCtx, deps),
      engine: (config) => handleEngineOnboardCtaYes(appCtx, deps, config),
    });
  });
  bot.callbackQuery('onboard_cta_later', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await routeOnboardByMode(appCtx, deps, {
      founder: () => handleOnboardCtaLater(appCtx, deps),
      engine: (config) => handleEngineOnboardCtaLater(appCtx, deps, config),
    });
  });
  bot.callbackQuery('onboard_notif_off', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await routeOnboardByMode(appCtx, deps, {
      founder: () => handleOnboardNotifOff(appCtx, deps),
      engine: () => handleEngineOnboardNotifOff(appCtx, deps),
    });
  });
  bot.callbackQuery('onboard_report_cta_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardReportCtaYes(appCtx, deps);
  });
  bot.callbackQuery('onboard_report_cta_later', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardReportCtaLater(appCtx, deps);
  });

  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'onboard_timezone' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      const text = ctx.message.text?.trim() ?? '';
      await routeOnboardByMode(appCtx, deps, {
        founder: () => handleOnboardTimezone(appCtx, text, deps),
        engine: (config) => handleEngineOnboardTimezone(appCtx, text, deps, config),
      });
    }
  );
}
