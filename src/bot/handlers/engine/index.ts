import type { Bot } from 'grammy';
import type { BotContext } from '../../context.js';
import { buildAppContext } from '../../transport/telegram-adapter.js';
import { withEngineMode } from '../../with-engine-mode.js';
import type { HandlerDeps } from '../deps.js';
import { handleFocusCommand, handleFocusShow, handleFocusEdit, handleFocusMessage, handleNotifyFocus } from './commitment.js';
import {
  handleLogCommand,
  handleLogDateChoice,
  handleLogShow,
  handleLogEdit,
  handleLogMoveYes,
  handleLogMoveNo,
  handleLogMovePartial,
  handleLogMessage,
  handleNotifyLog,
  handleLogSkipEnableNotif,
} from './daily.js';
import { handleRecapCommand, handleRecapShow, handleRecapEdit, handleRecapChoiceMessage, handleNotifyRecap } from './digest.js';
import { handlePivotCommand, handlePivotMessage } from './switch.js';

const ENGINE_STEPS =
  /^engine_(focus_(title|\d+|choice)|log_(date|movement|choice|yes|no|partial)_\d+|pivot_\d+|recap_choice)$/;

export function registerEngineHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('focus', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await withEngineMode((c, d, mode, config) => handleFocusCommand(c, d, mode, config))(appCtx, deps);
  });
  bot.command('log', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await withEngineMode((c, d, mode, config) => handleLogCommand(c, d, mode, config))(appCtx, deps);
  });
  bot.command('recap', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await withEngineMode((c, d, mode, config) => handleRecapCommand(c, d, mode, config))(appCtx, deps);
  });
  bot.command('pivot', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await withEngineMode((c, d, mode, config) => handlePivotCommand(c, d, mode, config))(appCtx, deps);
  });

  const wrap = <T extends unknown[]>(
    fn: (ctx: import('../../transport/types.js').AppContext, deps: HandlerDeps, mode: import('../../../services/product-mode.js').EngineMode, config: import('../../../modes/types.js').ModeConfig, ...args: T) => Promise<void>
  ) =>
    async (ctx: BotContext & { userId?: string }, ...args: T) => {
      const appCtx = buildAppContext(ctx);
      await withEngineMode((c, d, mode, config) => fn(c, d, mode, config, ...args))(appCtx, deps);
    };

  bot.callbackQuery('engine_focus_show', wrap((c, d, mode) => handleFocusShow(c, d, mode)));
  bot.callbackQuery('engine_focus_edit', wrap((c, d, mode, config) => handleFocusEdit(c, d, mode, config)));
  bot.callbackQuery('notify_focus', wrap((c, d, mode, config) => handleNotifyFocus(c, d, mode, config)));

  bot.callbackQuery('engine_log_show', wrap((c, d, mode) => handleLogShow(c, d, mode)));
  bot.callbackQuery('engine_log_edit', wrap((c, d, _mode, config) => handleLogEdit(c, d, config)));
  bot.callbackQuery('engine_move_yes', wrap((c, _d, _mode, config) => handleLogMoveYes(c, config)));
  bot.callbackQuery('engine_move_no', wrap((c, _d, _mode, config) => handleLogMoveNo(c, config)));
  bot.callbackQuery('engine_move_partial', wrap((c, _d, _mode, config) => handleLogMovePartial(c, config)));
  bot.callbackQuery('engine_log_date_yesterday', wrap((c, d, mode, config) => handleLogDateChoice(c, 'yesterday', d, mode, config)));
  bot.callbackQuery('engine_log_date_today', wrap((c, d, mode, config) => handleLogDateChoice(c, 'today', d, mode, config)));
  bot.callbackQuery('engine_log_skip_enable_notif', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await withEngineMode((c, d) => handleLogSkipEnableNotif(c, d))(appCtx, deps);
  });
  bot.callbackQuery('notify_log', wrap((c, d, mode, config) => handleNotifyLog(c, d, mode, config)));

  bot.callbackQuery('engine_recap_show', wrap((c, d, mode) => handleRecapShow(c, d, mode)));
  bot.callbackQuery('engine_recap_edit', wrap((c, d, mode, config) => handleRecapEdit(c, d, mode, config)));
  bot.callbackQuery('notify_recap', wrap((c, d, mode, config) => handleNotifyRecap(c, d, mode, config)));

  bot.on('message:text').filter(
    (ctx) => (ctx.session?.step?.match(ENGINE_STEPS) ?? false) && !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      const text = ctx.message.text?.trim() ?? '';
      const step = ctx.session?.step ?? '';
      if (step.startsWith('engine_focus')) {
        await withEngineMode((c, d, mode, config) => handleFocusMessage(c, text, d, mode, config))(appCtx, deps);
      } else if (step.startsWith('engine_log_')) {
        await withEngineMode((c, d, mode, config) => handleLogMessage(c, text, d, mode, config))(appCtx, deps);
      } else if (step.startsWith('engine_pivot_')) {
        await withEngineMode((c, d, mode, config) => handlePivotMessage(c, text, d, mode, config))(appCtx, deps);
      } else if (step === 'engine_recap_choice') {
        await handleRecapChoiceMessage(appCtx, text);
      }
    }
  );
}
