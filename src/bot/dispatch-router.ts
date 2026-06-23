import type { AppContext } from './transport/types.js';
import type { IncomingEvent } from './transport/types.js';
import type { HandlerDeps } from './handlers/deps.js';
import { isEngineMode } from '../services/product-mode.js';
import { PRODUCT_MODE_PICK_FIRST } from './product-mode-copy.js';
import { dispatch } from './dispatch.js';
import { dispatchEngine } from './dispatch-engine.js';
import {
  handleUnifiedStart,
  handleProductModePick,
  handleProductModeSet,
  handleSettingsProductModeMenu,
  handleSettingsProductModeBack,
} from './handlers/product-mode.js';

const PRODUCT_MODE_CALLBACKS = new Set([
  'product_mode_founder',
  'product_mode_closure',
  'product_mode_learning',
  'product_mode_startup',
  'product_mode_habit',
  'product_mode_jobhunt',
  'product_mode_work',
  'product_mode_quit',
  'product_mode_set_founder',
  'product_mode_set_closure',
  'product_mode_set_learning',
  'product_mode_set_startup',
  'product_mode_set_habit',
  'product_mode_set_jobhunt',
  'product_mode_set_work',
  'product_mode_set_quit',
  'settings_product_mode',
  'settings_product_mode_back',
]);

const SHARED_COMMANDS = new Set(['settings', 'delete']);

function isSettingsCallback(data: string): boolean {
  return (
    data.startsWith('settings_') ||
    data.startsWith('delete_confirm_') ||
    PRODUCT_MODE_CALLBACKS.has(data)
  );
}

function isProductCommand(name: string): boolean {
  return !SHARED_COMMANDS.has(name) && name !== 'start';
}

export async function dispatchForUser(ctx: AppContext, event: IncomingEvent, deps: HandlerDeps): Promise<void> {
  if (event.type === 'command' && event.name === 'start') {
    return handleUnifiedStart(ctx, deps);
  }

  if (event.type === 'callback' && PRODUCT_MODE_CALLBACKS.has(event.data)) {
    switch (event.data) {
      case 'product_mode_founder':
        return handleProductModePick(ctx, 'founder', deps);
      case 'product_mode_closure':
        return handleProductModePick(ctx, 'closure', deps);
      case 'product_mode_learning':
        return handleProductModePick(ctx, 'learning', deps);
      case 'product_mode_startup':
        return handleProductModePick(ctx, 'startup', deps);
      case 'product_mode_habit':
        return handleProductModePick(ctx, 'habit', deps);
      case 'product_mode_jobhunt':
        return handleProductModePick(ctx, 'jobhunt', deps);
      case 'product_mode_work':
        return handleProductModePick(ctx, 'work', deps);
      case 'product_mode_quit':
        return handleProductModePick(ctx, 'quit', deps);
      case 'product_mode_set_founder':
        return handleProductModeSet(ctx, 'founder', deps);
      case 'product_mode_set_closure':
        return handleProductModeSet(ctx, 'closure', deps);
      case 'product_mode_set_learning':
        return handleProductModeSet(ctx, 'learning', deps);
      case 'product_mode_set_startup':
        return handleProductModeSet(ctx, 'startup', deps);
      case 'product_mode_set_habit':
        return handleProductModeSet(ctx, 'habit', deps);
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
    }
  }

  const mode = await deps.getUserProductMode(ctx.userId);

  if (event.type === 'command' && SHARED_COMMANDS.has(event.name)) {
    return dispatch(ctx, event, deps);
  }
  if (event.type === 'callback' && isSettingsCallback(event.data)) {
    return dispatch(ctx, event, deps);
  }
  if (event.type === 'photo' && ctx.session?.step === 'settings_avatar_upload_wait') {
    return dispatch(ctx, event, deps);
  }
  if (
    event.type === 'message' &&
    (ctx.session?.step === 'settings_declaration_time_input' ||
      ctx.session?.step === 'settings_fixation_time_input' ||
      ctx.session?.step === 'settings_report_time_input' ||
      ctx.session?.step === 'settings_tz_input')
  ) {
    return dispatch(ctx, event, deps);
  }

  if (!mode) {
    if (event.type === 'command' && isProductCommand(event.name)) {
      await ctx.reply(PRODUCT_MODE_PICK_FIRST);
      return;
    }
    if (event.type === 'callback' && !isSettingsCallback(event.data)) {
      await ctx.reply(PRODUCT_MODE_PICK_FIRST);
      return;
    }
    return dispatch(ctx, event, deps);
  }

  if (isEngineMode(mode)) {
    return dispatchEngine(ctx, event, deps);
  }
  return dispatch(ctx, event, deps);
}
