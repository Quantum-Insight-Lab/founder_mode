/**
 * Central dispatch: routes IncomingEvent to the same handlers used by Telegram.
 * Used by the MAX adapter so both channels share one handler set.
 */
import { logger } from '../observability/logger.js';
import type { AppContext } from './transport/types.js';
import type { IncomingEvent } from './transport/types.js';
import type { HandlerDeps } from './handlers/deps.js';
import {
  handleStart,
  handleOnboardTimezone,
  handleOnboardCtaYes,
  handleOnboardCtaLater,
  handleOnboardReviewCtaYes,
  handleOnboardReviewCtaLater,
} from './handlers/onboarding.js';
import {
  handlePlanCommand,
  handlePlanShow,
  handlePlanEdit,
  handlePlanEditConfirmYes,
  handlePlanEditConfirmNo,
  handlePlanningMessage,
  handleNotifyPlan,
} from './handlers/plan.js';
import {
  handleReflectCommand,
  handleReflectSkipEnableNotif,
  handleReflectDateChoice,
  handleReflectShow,
  handleReflectEdit,
  handleReflectEditConfirmYes,
  handleReflectEditConfirmNo,
  handleReflectNo,
  handleReflectPartial,
  handleReflectWeekClosed,
  handleReflectYes,
  handleReflectionMessage,
  handleNotifyReflect,
} from './handlers/reflect.js';
import { handleReviewCommand, handleReviewUserNote, handleNotifyReview } from './handlers/review.js';
import {
  handleSettingsCommand,
  handleSettingsNotifToggle,
  handleSettingsPlan,
  handleSettingsPlanDay,
  handleSettingsPlanTimeCustom,
  handleSettingsPlanTime,
  handleSettingsReflect,
  handleSettingsReflectDays,
  handleSettingsReflectTimeCustom,
  handleSettingsReflectTime,
  handleSettingsReview,
  handleSettingsReviewDay,
  handleSettingsReviewTimeCustom,
  handleSettingsReviewTime,
  handleSettingsTz,
  handleSettingsTimeInput,
  handleSettingsTzInput,
} from './handlers/settings.js';
import { handleDeleteCommand, handleDeleteConfirmYes, handleDeleteConfirmNo } from './handlers/delete.js';

function timeFromCallbackData(data: string): string {
  const m = data.match(/^settings_(?:plan|reflect|review)_time_([\d-]+)$/);
  return String(m?.[1] ?? '').replace('-', ':');
}

export async function dispatch(ctx: AppContext, event: IncomingEvent, deps: HandlerDeps): Promise<void> {
  if (event.type === 'command') {
    logger.debug({ channel: ctx.channel, userId: ctx.userId, command: event.name }, 'Dispatch command');
    switch (event.name) {
      case 'start':
        return handleStart(ctx, deps);
      case 'plan':
        return handlePlanCommand(ctx, deps);
      case 'reflect':
        return handleReflectCommand(ctx, deps);
      case 'review':
        return handleReviewCommand(ctx, deps);
      case 'settings':
        return handleSettingsCommand(ctx, deps);
      case 'delete':
        return handleDeleteCommand(ctx, deps);
      default:
        logger.debug({ channel: ctx.channel, userId: ctx.userId, command: event.name }, 'Unknown command, skip');
        return;
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
      case 'onboard_review_cta_yes':
        return handleOnboardReviewCtaYes(ctx, deps);
      case 'onboard_review_cta_later':
        return handleOnboardReviewCtaLater(ctx, deps);
      case 'plan_show':
        return handlePlanShow(ctx, deps);
      case 'plan_edit':
        return handlePlanEdit(ctx, deps);
      case 'plan_edit_confirm_yes':
        return handlePlanEditConfirmYes(ctx, deps);
      case 'plan_edit_confirm_no':
        return handlePlanEditConfirmNo(ctx, deps);
      case 'notify_plan':
        return handleNotifyPlan(ctx, deps);
      case 'reflect_skip_enable_notif':
        return handleReflectSkipEnableNotif(ctx, deps);
      case 'reflect_date_yesterday':
        return handleReflectDateChoice(ctx, 'yesterday', deps);
      case 'reflect_date_today':
        return handleReflectDateChoice(ctx, 'today', deps);
      case 'reflect_show':
        return handleReflectShow(ctx, deps);
      case 'reflect_edit':
        return handleReflectEdit(ctx, deps);
      case 'reflect_edit_confirm_yes':
        return handleReflectEditConfirmYes(ctx, deps);
      case 'reflect_edit_confirm_no':
        return handleReflectEditConfirmNo(ctx, deps);
      case 'reflect_no':
        return handleReflectNo(ctx, deps);
      case 'reflect_partial':
        return handleReflectPartial(ctx, deps);
      case 'reflect_week_closed':
        return handleReflectWeekClosed(ctx, deps);
      case 'reflect_yes':
        return handleReflectYes(ctx, deps);
      case 'notify_reflect':
        return handleNotifyReflect(ctx, deps);
      case 'notify_review':
        return handleNotifyReview(ctx, deps);
      case 'settings_notif_toggle':
        return handleSettingsNotifToggle(ctx, deps);
      case 'settings_plan':
        return handleSettingsPlan(ctx, deps);
      case 'settings_plan_time_custom':
        return handleSettingsPlanTimeCustom(ctx, deps);
      case 'settings_reflect':
        return handleSettingsReflect(ctx, deps);
      case 'settings_reflect_time_custom':
        return handleSettingsReflectTimeCustom(ctx, deps);
      case 'settings_review':
        return handleSettingsReview(ctx, deps);
      case 'settings_review_time_custom':
        return handleSettingsReviewTimeCustom(ctx, deps);
      case 'settings_tz':
        return handleSettingsTz(ctx, deps);
      case 'delete_confirm_yes':
        return handleDeleteConfirmYes(ctx, deps);
      case 'delete_confirm_no':
        return handleDeleteConfirmNo(ctx, deps);
      default: {
        const planDay = data.match(/^settings_plan_day_(\d)$/);
        if (planDay) return handleSettingsPlanDay(ctx, parseInt(planDay[1], 10), deps);
        const planTime = data.match(/^settings_plan_time_([\d-]+)$/);
        if (planTime) return handleSettingsPlanTime(ctx, timeFromCallbackData(data), deps);
        const reflectDays = data.match(/^settings_reflect_days_(.+)$/);
        if (reflectDays) return handleSettingsReflectDays(ctx, reflectDays[1], deps);
        const reflectTime = data.match(/^settings_reflect_time_([\d-]+)$/);
        if (reflectTime) return handleSettingsReflectTime(ctx, timeFromCallbackData(data), deps);
        const reviewDay = data.match(/^settings_review_day_(\d)$/);
        if (reviewDay) return handleSettingsReviewDay(ctx, parseInt(reviewDay[1], 10), deps);
        const reviewTime = data.match(/^settings_review_time_([\d-]+)$/);
        if (reviewTime) return handleSettingsReviewTime(ctx, timeFromCallbackData(data), deps);
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
    if (step?.startsWith('planning_')) return handlePlanningMessage(ctx, text, deps);
    if (step?.match(/^reflect_(movement|nomovement|partial|weekclosed)_\d+$/)) return handleReflectionMessage(ctx, text, deps);
    if (step === 'review_user_note') return handleReviewUserNote(ctx, text, deps);
    if (step === 'settings_plan_time_input' || step === 'settings_reflect_time_input' || step === 'settings_review_time_input') {
      return handleSettingsTimeInput(ctx, text, deps);
    }
    if (step === 'settings_tz_input') return handleSettingsTzInput(ctx, text, deps);
    logger.debug({ channel: ctx.channel, userId: ctx.userId, step }, 'Message not for any step, skip');
  }
}
