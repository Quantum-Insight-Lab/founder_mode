/**
 * Engine mode dispatch: /focus /log /recap /pivot
 */
import type { AppContext, IncomingEvent } from './transport/types.js';
import type { HandlerDeps } from './handlers/deps.js';
import { isEngineMode } from '../services/product-mode.js';
import { getModeConfig } from '../modes/registry.js';
import { PRODUCT_MODE_PICK_FIRST } from './product-mode-copy.js';
import { idleCommandListForMode } from './idle-for-mode.js';
import { FLOW_CHOICE_USE_BUTTONS_HINT } from '../modes/shared.js';
import {
  handleEngineStart,
  handleEngineOnboardCtaYes,
  handleEngineOnboardCtaLater,
  handleEngineOnboardNotifOff,
  handleEngineOnboardTimezone,
  handleEngineOnboardDigestCtaYes,
  handleEngineOnboardDigestCtaLater,
} from './handlers/engine/onboarding.js';
import {
  handleFocusCommand,
  handleFocusShow,
  handleFocusEdit,
  handleFocusMessage,
  handleNotifyFocus,
} from './handlers/engine/commitment.js';
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
} from './handlers/engine/daily.js';
import {
  handleRecapCommand,
  handleRecapShow,
  handleRecapEdit,
  handleRecapChoiceMessage,
  handleNotifyRecap,
} from './handlers/engine/digest.js';
import { handlePivotCommand, handlePivotMessage } from './handlers/engine/switch.js';
import {
  handleSettingsCommand,
  handleSettingsNotificationsMenu,
  handleSettingsNotificationsBack,
  handleSettingsNotifToggle,
  handleSettingsDeclaration,
  handleSettingsDeclarationDay,
  handleSettingsDeclarationTimeCustom,
  handleSettingsDeclarationTime,
  handleSettingsFixation,
  handleSettingsFixationDays,
  handleSettingsFixationTimeCustom,
  handleSettingsFixationTime,
  handleSettingsReport,
  handleSettingsReportDay,
  handleSettingsReportTimeCustom,
  handleSettingsReportTime,
  handleSettingsTz,
  handleSettingsTimeInput,
  handleSettingsTzInput,
  handleSettingsAvatar,
  handleSettingsAvatarUpload,
  handleSettingsAvatarMessenger,
  handleSettingsAvatarReset,
  handleSettingsAvatarBack,
  handleSettingsAvatarPhotoUpload,
} from './handlers/settings.js';
import { handleDeleteCommand, handleDeleteConfirmYes, handleDeleteConfirmNo } from './handlers/delete.js';
import {
  handleProductModePick,
  handleProductModeSet,
  handleSettingsProductModeMenu,
  handleSettingsProductModeBack,
} from './handlers/product-mode.js';
import { timeFromSettingsCallbackData } from './settings-callback.js';

async function handleIdleMessage(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const mode = await deps.getUserProductMode(ctx.userId);
  if (!mode) return ctx.reply(PRODUCT_MODE_PICK_FIRST);
  return ctx.reply(idleCommandListForMode(mode));
}

export async function dispatchEngine(ctx: AppContext, event: IncomingEvent, deps: HandlerDeps): Promise<void> {
  const mode = await deps.getUserProductMode(ctx.userId);
  const config = isEngineMode(mode) ? getModeConfig(mode) : null;

  const isSettingsOrDelete =
    (event.type === 'command' && (event.name === 'settings' || event.name === 'delete')) ||
    (event.type === 'callback' &&
      (event.data.startsWith('settings_') ||
        event.data.startsWith('delete_confirm_') ||
        event.data === 'onboard_notif_off'));

  if (!isEngineMode(mode) && !isSettingsOrDelete) {
    await ctx.reply(PRODUCT_MODE_PICK_FIRST);
    return;
  }

  if (event.type === 'command') {
    switch (event.name) {
      case 'start':
        if (!mode || !config) {
          await ctx.reply(PRODUCT_MODE_PICK_FIRST);
          return;
        }
        return handleEngineStart(ctx, deps, mode, config);
      case 'focus':
        return handleFocusCommand(ctx, deps, mode!, config!);
      case 'log':
        return handleLogCommand(ctx, deps, mode!, config!);
      case 'recap':
        return handleRecapCommand(ctx, deps, mode!, config!);
      case 'pivot':
        return handlePivotCommand(ctx, deps, mode!, config!);
      case 'settings':
        return handleSettingsCommand(ctx, deps);
      case 'delete':
        return handleDeleteCommand(ctx, deps);
      default:
        return handleIdleMessage(ctx, deps);
    }
  }

  if (event.type === 'callback') {
    const data = event.data;
    const engineCallbacks = new Set([
      'engine_focus_show', 'engine_focus_edit', 'notify_focus',
      'engine_log_show', 'engine_log_edit', 'engine_move_yes', 'engine_move_no', 'engine_move_partial',
      'engine_log_date_yesterday', 'engine_log_date_today', 'notify_log',
      'engine_recap_show', 'engine_recap_edit', 'notify_recap',
      'onboard_cta_yes', 'onboard_cta_later', 'onboard_digest_cta_yes', 'onboard_digest_cta_later',
    ]);
    if (engineCallbacks.has(data) && (!mode || !config)) {
      await ctx.reply(PRODUCT_MODE_PICK_FIRST);
      return;
    }
    const m = mode!;
    const c = config!;
    switch (data) {
      case 'product_mode_closure':
        return handleProductModePick(ctx, 'closure', deps);
      case 'product_mode_learning':
        return handleProductModePick(ctx, 'learning', deps);
      case 'product_mode_startup':
        return handleProductModePick(ctx, 'startup', deps);
      case 'product_mode_jobhunt':
        return handleProductModePick(ctx, 'jobhunt', deps);
      case 'product_mode_work':
        return handleProductModePick(ctx, 'work', deps);
      case 'product_mode_quit':
        return handleProductModePick(ctx, 'quit', deps);
      case 'product_mode_set_closure':
        return handleProductModeSet(ctx, 'closure', deps);
      case 'product_mode_set_learning':
        return handleProductModeSet(ctx, 'learning', deps);
      case 'product_mode_set_startup':
        return handleProductModeSet(ctx, 'startup', deps);
      case 'product_mode_set_jobhunt':
        return handleProductModeSet(ctx, 'jobhunt', deps);
      case 'product_mode_set_work':
        return handleProductModeSet(ctx, 'work', deps);
      case 'product_mode_set_quit':
        return handleProductModeSet(ctx, 'quit', deps);
      case 'settings_product_mode':
        return handleSettingsProductModeMenu(ctx, deps);
      case 'settings_product_mode_back':
        return handleSettingsProductModeBack(ctx, deps);
      case 'onboard_cta_yes':
        return handleEngineOnboardCtaYes(ctx, deps, c);
      case 'onboard_cta_later':
        return handleEngineOnboardCtaLater(ctx, deps, c);
      case 'onboard_notif_off':
        return handleEngineOnboardNotifOff(ctx, deps);
      case 'onboard_digest_cta_yes':
        return handleEngineOnboardDigestCtaYes(ctx, deps, c);
      case 'onboard_digest_cta_later':
        return handleEngineOnboardDigestCtaLater(ctx, deps, c);
      case 'engine_focus_show':
        return handleFocusShow(ctx, deps, m);
      case 'engine_focus_edit':
        return handleFocusEdit(ctx, deps, m, c);
      case 'notify_focus':
        return handleNotifyFocus(ctx, deps, m, c);
      case 'engine_log_show':
        return handleLogShow(ctx, deps, m);
      case 'engine_log_edit':
        return handleLogEdit(ctx, deps, c);
      case 'engine_move_yes':
        return handleLogMoveYes(ctx, c);
      case 'engine_move_no':
        return handleLogMoveNo(ctx, c);
      case 'engine_move_partial':
        return handleLogMovePartial(ctx, c);
      case 'engine_log_date_yesterday':
        return handleLogDateChoice(ctx, 'yesterday', deps, m, c);
      case 'engine_log_date_today':
        return handleLogDateChoice(ctx, 'today', deps, m, c);
      case 'engine_log_skip_enable_notif':
        return handleLogSkipEnableNotif(ctx, deps);
      case 'notify_log':
        return handleNotifyLog(ctx, deps, m, c);
      case 'engine_recap_show':
        return handleRecapShow(ctx, deps, m);
      case 'engine_recap_edit':
        return handleRecapEdit(ctx, deps, m, c);
      case 'notify_recap':
        return handleNotifyRecap(ctx, deps, m, c);
      case 'settings_notifications':
        return handleSettingsNotificationsMenu(ctx, deps);
      case 'settings_notifications_back':
        return handleSettingsNotificationsBack(ctx, deps);
      case 'settings_notif_toggle':
        return handleSettingsNotifToggle(ctx, deps);
      case 'settings_declaration':
        return handleSettingsDeclaration(ctx, deps);
      case 'settings_declaration_time_custom':
        return handleSettingsDeclarationTimeCustom(ctx, deps);
      case 'settings_fixation':
        return handleSettingsFixation(ctx, deps);
      case 'settings_fixation_time_custom':
        return handleSettingsFixationTimeCustom(ctx, deps);
      case 'settings_report':
        return handleSettingsReport(ctx, deps);
      case 'settings_report_time_custom':
        return handleSettingsReportTimeCustom(ctx, deps);
      case 'settings_tz':
        return handleSettingsTz(ctx, deps);
      case 'settings_avatar':
        return handleSettingsAvatar(ctx, deps);
      case 'settings_avatar_upload':
        return handleSettingsAvatarUpload(ctx, deps);
      case 'settings_avatar_messenger':
        return handleSettingsAvatarMessenger(ctx, deps);
      case 'settings_avatar_reset':
        return handleSettingsAvatarReset(ctx, deps);
      case 'settings_avatar_back':
        return handleSettingsAvatarBack(ctx, deps);
      case 'delete_confirm_yes':
        return handleDeleteConfirmYes(ctx, deps);
      case 'delete_confirm_no':
        return handleDeleteConfirmNo(ctx, deps);
      default: {
        const declDay = data.match(/^settings_declaration_day_(\d)$/);
        if (declDay) return handleSettingsDeclarationDay(ctx, parseInt(declDay[1], 10), deps);
        const declTime = data.match(/^settings_declaration_time_([\d-]+)$/);
        if (declTime) {
          const time = timeFromSettingsCallbackData(data);
          if (time) return handleSettingsDeclarationTime(ctx, time, deps);
        }
        const fixationDays = data.match(/^settings_fixation_days_(.+)$/);
        if (fixationDays) return handleSettingsFixationDays(ctx, fixationDays[1], deps);
        const fixationTime = data.match(/^settings_fixation_time_([\d-]+)$/);
        if (fixationTime) {
          const time = timeFromSettingsCallbackData(data);
          if (time) return handleSettingsFixationTime(ctx, time, deps);
        }
        const reportDay = data.match(/^settings_report_day_(\d)$/);
        if (reportDay) return handleSettingsReportDay(ctx, parseInt(reportDay[1], 10), deps);
        const reportTime = data.match(/^settings_report_time_([\d-]+)$/);
        if (reportTime) {
          const time = timeFromSettingsCallbackData(data);
          if (time) return handleSettingsReportTime(ctx, time, deps);
        }
        return;
      }
    }
  }

  if (event.type === 'message') {
    const step = ctx.session?.step;
    const text = event.text.trim();
    if (!text) return;
    if (step === 'onboard_timezone') {
      if (!config) return ctx.reply(PRODUCT_MODE_PICK_FIRST);
      return handleEngineOnboardTimezone(ctx, text, deps, config);
    }
    if (!mode || !config) {
      if (!text.startsWith('/')) await handleIdleMessage(ctx, deps);
      return;
    }
    const m = mode;
    const c = config;
    if (step === 'engine_focus_choice' || step === 'engine_log_choice' || step === 'engine_recap_choice') {
      if (!text.startsWith('/')) await ctx.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
      return;
    }
    if (step?.startsWith('engine_focus')) return handleFocusMessage(ctx, text, deps, m, c);
    if (step?.match(/^engine_log_(yes|no|partial)_\d+$/)) return handleLogMessage(ctx, text, deps, m, c);
    if (step?.match(/^engine_pivot_\d+$/)) return handlePivotMessage(ctx, text, deps, m, c);
    if (step === 'engine_recap_choice') return handleRecapChoiceMessage(ctx, text);
    if (
      step === 'settings_declaration_time_input' ||
      step === 'settings_fixation_time_input' ||
      step === 'settings_report_time_input'
    ) {
      return handleSettingsTimeInput(ctx, text, deps);
    }
    if (step === 'settings_tz_input') return handleSettingsTzInput(ctx, text, deps);
    if (!text.startsWith('/')) return handleIdleMessage(ctx, deps);
    return handleIdleMessage(ctx, deps);
  }

  if (event.type === 'photo') {
    if (ctx.session?.step === 'settings_avatar_upload_wait') {
      return handleSettingsAvatarPhotoUpload(ctx, deps, event.bytes, event.mime);
    }
  }
}
