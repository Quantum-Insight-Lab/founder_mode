/**
 * Closure mode dispatch: routes IncomingEvent to closure handlers.
 */
import { logger } from '../observability/logger.js';
import type { AppContext } from './transport/types.js';
import type { IncomingEvent } from './transport/types.js';
import type { HandlerDeps } from './handlers/deps.js';
import { idleCommandListForMode } from './idle-for-mode.js';
import { withProductMode } from './with-product-mode.js';
import {
  handleUnifiedStart,
  handleProductModePick,
  handleProductModeSet,
  handleSettingsProductModeMenu,
  handleSettingsProductModeBack,
} from './handlers/product-mode.js';
import { PRODUCT_MODE_PICK_FIRST } from './product-mode-copy.js';
import { FLOW_CHOICE_USE_BUTTONS_HINT } from './closure-conversations.js';
import { timeFromSettingsCallbackData } from './settings-callback.js';
import {
  handleClosureOnboardTimezone,
  handleClosureOnboardCtaYes,
  handleClosureOnboardCtaLater,
  handleClosureOnboardDigestCtaYes,
  handleClosureOnboardDigestCtaLater,
  handleClosureOnboardNotifOff,
} from './handlers/closure/onboarding.js';
import {
  handleMatterCommand,
  handleMatterEdit,
  handleMatterMessage,
  handleMatterShow,
  handleNotifyMatter,
} from './handlers/closure/matter.js';
import {
  handleSwitchCommand,
  handleSwitchEdit,
  handleSwitchMessage,
  handleSwitchShow,
} from './handlers/closure/switch.js';
import {
  handleStepSkipEnableNotif,
  handleStepDateChoice,
  handleStepShow,
  handleStepEdit,
  handleStepEditConfirmNo,
  handleStepNo,
  handleStepPartial,
  handleStepYes,
  handleStepCommand,
  handleStepMessage,
  handleNotifyStep,
} from './handlers/closure/step.js';
import {
  handleDigestCommand,
  handleDigestEdit,
  handleDigestShow,
  handleNotifyDigest,
} from './handlers/closure/digest.js';
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

async function handleIdleMessage(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const mode = await deps.getUserProductMode(ctx.userId);
  if (!mode) return ctx.reply(PRODUCT_MODE_PICK_FIRST);
  return ctx.reply(idleCommandListForMode(mode));
}

export async function dispatchClosure(ctx: AppContext, event: IncomingEvent, deps: HandlerDeps): Promise<void> {
  if (event.type === 'command') {
    logger.debug({ channel: ctx.channel, userId: ctx.userId, command: event.name }, 'Dispatch closure command');
    switch (event.name) {
      case 'start':
        return handleUnifiedStart(ctx, deps);
      case 'matter':
        return withProductMode('closure', handleMatterCommand)(ctx, deps);
      case 'switch':
        return withProductMode('closure', handleSwitchCommand)(ctx, deps);
      case 'digest':
        return withProductMode('closure', handleDigestCommand)(ctx, deps);
      case 'step':
        return withProductMode('closure', handleStepCommand)(ctx, deps);
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
    switch (data) {
      case 'product_mode_founder':
        return handleProductModePick(ctx, 'founder', deps);
      case 'product_mode_closure':
        return handleProductModePick(ctx, 'closure', deps);
      case 'product_mode_set_founder':
        return handleProductModeSet(ctx, 'founder', deps);
      case 'product_mode_set_closure':
        return handleProductModeSet(ctx, 'closure', deps);
      case 'settings_product_mode':
        return handleSettingsProductModeMenu(ctx, deps);
      case 'settings_product_mode_back':
        return handleSettingsProductModeBack(ctx, deps);
      case 'onboard_cta_yes':
        return handleClosureOnboardCtaYes(ctx, deps);
      case 'onboard_cta_later':
        return handleClosureOnboardCtaLater(ctx, deps);
      case 'onboard_digest_cta_yes':
        return handleClosureOnboardDigestCtaYes(ctx, deps);
      case 'onboard_digest_cta_later':
        return handleClosureOnboardDigestCtaLater(ctx, deps);
      case 'onboard_notif_off':
        return handleClosureOnboardNotifOff(ctx, deps);
      case 'matter_show':
        return handleMatterShow(ctx, deps);
      case 'matter_edit':
        return handleMatterEdit(ctx, deps);
      case 'switch_show':
        return handleSwitchShow(ctx, deps);
      case 'switch_edit':
        return handleSwitchEdit(ctx, deps);
      case 'digest_show':
        return handleDigestShow(ctx, deps);
      case 'digest_edit':
        return handleDigestEdit(ctx, deps);
      case 'notify_matter':
        return handleNotifyMatter(ctx, deps);
      case 'step_skip_enable_notif':
        return handleStepSkipEnableNotif(ctx, deps);
      case 'step_date_yesterday':
        return handleStepDateChoice(ctx, 'yesterday', deps);
      case 'step_date_today':
        return handleStepDateChoice(ctx, 'today', deps);
      case 'step_show':
        return handleStepShow(ctx, deps);
      case 'step_edit':
        return handleStepEdit(ctx, deps);
      case 'step_edit_confirm_no':
        return handleStepEditConfirmNo(ctx, deps);
      case 'step_no':
        return handleStepNo(ctx, deps);
      case 'step_partial':
        return handleStepPartial(ctx, deps);
      case 'step_yes':
        return handleStepYes(ctx, deps);
      case 'notify_step':
        return handleNotifyStep(ctx, deps);
      case 'notify_digest':
        return handleNotifyDigest(ctx, deps);
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

    if (step === 'onboard_timezone') return handleClosureOnboardTimezone(ctx, text, deps);
    if (
      (step === 'matter_choice' ||
        step === 'switch_choice' ||
        step === 'digest_choice' ||
        step === 'step_choice') &&
      !text.startsWith('/')
    ) {
      await ctx.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
      return;
    }
    if (step?.match(/^matter_(title|\d+)$/)) return handleMatterMessage(ctx, text, deps);
    if (step?.match(/^step_(movement|nomovement|partial)_\d+$/)) return handleStepMessage(ctx, text, deps);
    if (step?.match(/^switch_\d+$/)) return handleSwitchMessage(ctx, text, deps);
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
    const step = ctx.session?.step;
    if (step === 'settings_avatar_upload_wait') {
      return handleSettingsAvatarPhotoUpload(ctx, deps, event.bytes, event.mime);
    }
  }
}
