/**
 * Central dispatch: routes IncomingEvent to the same handlers used by Telegram.
 * Used by the MAX adapter so both channels share one handler set.
 */
import { logger } from '../observability/logger.js';
import type { AppContext } from './transport/types.js';
import type { IncomingEvent } from './transport/types.js';
import type { HandlerDeps } from './handlers/deps.js';
import { IDLE_COMMAND_LIST_REPLY } from './idle-message.js';
import { FLOW_CHOICE_USE_BUTTONS_HINT } from './conversations.js';
import { timeFromSettingsCallbackData } from './settings-callback.js';
import {
  handleStart,
  handleOnboardTimezone,
  handleOnboardCtaYes,
  handleOnboardCtaLater,
  handleOnboardReportCtaYes,
  handleOnboardReportCtaLater,
} from './handlers/onboarding.js';
import {
  handleDeclarationCommand,
  handleDeclarationEdit,
  handleDeclarationMessage,
  handleDeclarationShow,
  handleNotifyDeclaration,
} from './handlers/declaration.js';
import { handleChangeCommand, handleChangeEdit, handleChangeMessage, handleChangeShow } from './handlers/change.js';
import {
  handleReportCommand,
  handleReportEdit,
  handleReportShow,
  handleNotifyReport,
} from './handlers/report.js';
import {
  handleFixationSkipEnableNotif,
  handleFixationDateChoice,
  handleFixationShow,
  handleFixationEdit,
  handleFixationEditConfirmYes,
  handleFixationEditConfirmNo,
  handleFixationNo,
  handleFixationPartial,
  handleFixationYes,
  handleFixationCommand,
  handleFixationMessage,
  handleNotifyFixation,
} from './handlers/fixation.js';
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

async function handleIdleMessage(ctx: AppContext): Promise<void> {
  return ctx.reply(IDLE_COMMAND_LIST_REPLY);
}

export async function dispatch(ctx: AppContext, event: IncomingEvent, deps: HandlerDeps): Promise<void> {
  if (event.type === 'command') {
    logger.debug({ channel: ctx.channel, userId: ctx.userId, command: event.name }, 'Dispatch command');
    switch (event.name) {
      case 'start':
        return handleStart(ctx, deps);
      case 'declaration':
        return handleDeclarationCommand(ctx, deps);
      case 'change':
        return handleChangeCommand(ctx, deps);
      case 'report':
        return handleReportCommand(ctx, deps);
      case 'fixation':
        return handleFixationCommand(ctx, deps);
      case 'settings':
        return handleSettingsCommand(ctx, deps);
      case 'delete':
        return handleDeleteCommand(ctx, deps);
      default:
        logger.debug({ channel: ctx.channel, userId: ctx.userId, command: event.name }, 'Unknown command, idle reply');
        return handleIdleMessage(ctx);
    }
  }

  if (event.type === 'callback') {
    const data = event.data;
    logger.debug({ channel: ctx.channel, userId: ctx.userId, callback: data }, 'Dispatch callback');
    switch (data) {
      case 'onboard_cta_yes':
        return handleOnboardCtaYes(ctx, deps);
      case 'onboard_cta_later':
        return handleOnboardCtaLater(ctx, deps);
      case 'onboard_report_cta_yes':
        return handleOnboardReportCtaYes(ctx, deps);
      case 'onboard_report_cta_later':
        return handleOnboardReportCtaLater(ctx, deps);
      case 'declaration_show':
        return handleDeclarationShow(ctx, deps);
      case 'declaration_edit':
        return handleDeclarationEdit(ctx, deps);
      case 'change_show':
        return handleChangeShow(ctx, deps);
      case 'change_edit':
        return handleChangeEdit(ctx, deps);
      case 'report_show':
        return handleReportShow(ctx, deps);
      case 'report_edit':
        return handleReportEdit(ctx, deps);
      case 'notify_declaration':
        return handleNotifyDeclaration(ctx, deps);
      case 'fixation_skip_enable_notif':
        return handleFixationSkipEnableNotif(ctx, deps);
      case 'fixation_date_yesterday':
        return handleFixationDateChoice(ctx, 'yesterday', deps);
      case 'fixation_date_today':
        return handleFixationDateChoice(ctx, 'today', deps);
      case 'fixation_show':
        return handleFixationShow(ctx, deps);
      case 'fixation_edit':
        return handleFixationEdit(ctx, deps);
      case 'fixation_edit_confirm_yes':
        return handleFixationEditConfirmYes(ctx, deps);
      case 'fixation_edit_confirm_no':
        return handleFixationEditConfirmNo(ctx, deps);
      case 'fixation_no':
        return handleFixationNo(ctx, deps);
      case 'fixation_partial':
        return handleFixationPartial(ctx, deps);
      case 'fixation_yes':
        return handleFixationYes(ctx, deps);
      case 'notify_fixation':
        return handleNotifyFixation(ctx, deps);
      case 'notify_report':
        return handleNotifyReport(ctx, deps);
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
        logger.debug({ channel: ctx.channel, userId: ctx.userId, callback: data }, 'Unknown callback, skip');
        return;
      }
    }
  }

  if (event.type === 'message') {
    const step = ctx.session?.step;
    const text = event.text.trim();
    logger.debug({ channel: ctx.channel, userId: ctx.userId, step, hasText: !!text }, 'Dispatch message');
    if (!text) return;

    if (step === 'onboard_timezone') return handleOnboardTimezone(ctx, text, deps);
    if (
      (step === 'declaration_choice' ||
        step === 'change_choice' ||
        step === 'report_choice' ||
        step === 'fixation_choice') &&
      !text.startsWith('/')
    ) {
      await ctx.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
      return;
    }
    if (step?.match(/^declaration_\d+$/)) return handleDeclarationMessage(ctx, text, deps);
    if (step?.match(/^fixation_(movement|nomovement|partial)_\d+$/)) return handleFixationMessage(ctx, text, deps);
    if (step?.match(/^change_\d+$/)) return handleChangeMessage(ctx, text, deps);
    if (
      step === 'settings_declaration_time_input' ||
      step === 'settings_fixation_time_input' ||
      step === 'settings_report_time_input'
    ) {
      return handleSettingsTimeInput(ctx, text, deps);
    }
    if (step === 'settings_tz_input') return handleSettingsTzInput(ctx, text, deps);
    if (!text.startsWith('/')) return handleIdleMessage(ctx);
    logger.debug({ channel: ctx.channel, userId: ctx.userId, step }, 'Slash message not for any step, idle reply');
    return handleIdleMessage(ctx);
  }

  if (event.type === 'photo') {
    const step = ctx.session?.step;
    logger.debug({ channel: ctx.channel, userId: ctx.userId, step, mime: event.mime }, 'Dispatch photo');
    if (step === 'settings_avatar_upload_wait') {
      return handleSettingsAvatarPhotoUpload(ctx, deps, event.bytes, event.mime);
    }
    return;
  }
}
