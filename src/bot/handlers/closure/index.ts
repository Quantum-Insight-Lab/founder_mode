import type { Bot } from 'grammy';
import type { BotContext } from '../../context.js';
import { registerClosureOnboardingHandlers } from './onboarding.js';
import { registerMatterHandlers } from './matter.js';
import { registerSwitchHandlers } from './switch.js';
import { registerStepHandlers } from './step.js';
import { registerDigestHandlers } from './digest.js';
import { registerSettingsHandlers } from '../settings.js';
import { registerDeleteHandlers } from '../delete.js';
import type { HandlerDeps } from '../deps.js';

export function registerClosureHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  registerClosureOnboardingHandlers(bot, deps);
  registerMatterHandlers(bot, deps);
  registerSwitchHandlers(bot, deps);
  registerStepHandlers(bot, deps);
  registerDigestHandlers(bot, deps);
  registerSettingsHandlers(bot, deps);
  registerDeleteHandlers(bot, deps);
}
