import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import type { ProductMode } from '../../services/product-mode.js';
import { isClosureProductMode, productModeLabel } from '../../services/product-mode.js';
import { botOpens } from '../../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import { ONBOARDING_INTRO } from '../conversations.js';
import { CLOSURE_ONBOARDING_INTRO } from '../closure-conversations.js';
import {
  PRODUCT_MODE_PICKER_TEXT,
  PRODUCT_MODE_SWITCHED_CLOSURE,
  PRODUCT_MODE_SWITCHED_FOUNDER,
  SETTINGS_PRODUCT_MODE,
} from '../product-mode-copy.js';
import type { HandlerDeps } from './deps.js';
import { handleStart } from './onboarding.js';
import { handleOnboardCtaYes, handleOnboardCtaLater, handleOnboardNotifOff, handleOnboardTimezone, handleOnboardReportCtaYes, handleOnboardReportCtaLater } from './onboarding.js';
import {
  handleClosureStart,
  handleClosureOnboardCtaYes,
  handleClosureOnboardCtaLater,
  handleClosureOnboardNotifOff,
  handleClosureOnboardTimezone,
  handleClosureOnboardDigestCtaYes,
  handleClosureOnboardDigestCtaLater,
} from './closure/onboarding.js';

const MODE_PICKER_MARKUP: import('../transport/types.js').InlineButton[][] = [
  [
    { text: 'Founder Mode', callback_data: 'product_mode_founder' },
    { text: 'Closure', callback_data: 'product_mode_closure' },
  ],
];

export async function runModeStart(ctx: AppContext, deps: HandlerDeps, mode: ProductMode): Promise<void> {
  if (isClosureProductMode(mode)) {
    await handleClosureStart(ctx, deps, { skipBotOpen: true });
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
  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: [
      [
        { text: 'Founder Mode', callback_data: 'product_mode_set_founder' },
        { text: 'Closure', callback_data: 'product_mode_set_closure' },
      ],
      [{ text: 'Назад', callback_data: 'settings_product_mode_back' }],
    ],
  });
}

export async function handleProductModeSet(ctx: AppContext, mode: ProductMode, deps: HandlerDeps): Promise<void> {
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  await deps.setUserProductMode(userId, mode);
  logger.info({ userId, mode }, 'Product mode switched from settings');
  const intro = isClosureProductMode(mode) ? CLOSURE_ONBOARDING_INTRO : ONBOARDING_INTRO;
  const switched = isClosureProductMode(mode) ? PRODUCT_MODE_SWITCHED_CLOSURE : PRODUCT_MODE_SWITCHED_FOUNDER;
  await ctx.reply(`${switched}\n\n${intro}`, { parse_mode: 'HTML' });
}

export async function handleSettingsProductModeBack(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  await deps.showSettingsMenu(ctx, ctx.userId);
}

async function routeOnboardByMode(
  ctx: AppContext,
  deps: HandlerDeps,
  founder: () => Promise<void>,
  closure: () => Promise<void>
): Promise<void> {
  const mode = await deps.getUserProductMode(ctx.userId);
  if (!mode) {
    await ctx.reply('Сначала выбери режим: /start');
    return;
  }
  if (isClosureProductMode(mode)) await closure();
  else await founder();
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
  bot.callbackQuery('product_mode_set_founder', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, 'founder', deps);
  });
  bot.callbackQuery('product_mode_set_closure', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleProductModeSet(appCtx, 'closure', deps);
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
    await routeOnboardByMode(appCtx, deps, () => handleOnboardCtaYes(appCtx, deps), () => handleClosureOnboardCtaYes(appCtx, deps));
  });
  bot.callbackQuery('onboard_cta_later', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await routeOnboardByMode(appCtx, deps, () => handleOnboardCtaLater(appCtx, deps), () => handleClosureOnboardCtaLater(appCtx, deps));
  });
  bot.callbackQuery('onboard_notif_off', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await routeOnboardByMode(appCtx, deps, () => handleOnboardNotifOff(appCtx, deps), () => handleClosureOnboardNotifOff(appCtx, deps));
  });
  bot.callbackQuery('onboard_report_cta_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardReportCtaYes(appCtx, deps);
  });
  bot.callbackQuery('onboard_report_cta_later', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardReportCtaLater(appCtx, deps);
  });
  bot.callbackQuery('onboard_digest_cta_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleClosureOnboardDigestCtaYes(appCtx, deps);
  });
  bot.callbackQuery('onboard_digest_cta_later', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleClosureOnboardDigestCtaLater(appCtx, deps);
  });

  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'onboard_timezone' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      const text = ctx.message.text?.trim() ?? '';
      await routeOnboardByMode(
        appCtx,
        deps,
        () => handleOnboardTimezone(appCtx, text, deps),
        () => handleClosureOnboardTimezone(appCtx, text, deps)
      );
    }
  );
}
