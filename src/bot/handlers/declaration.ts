import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import {
  WEEKLY_DECLARATION_QUESTIONS,
  type WeeklyDeclarationAnswerKey,
} from '../conversations2.js';
import { logger } from '../../observability/logger.js';
import { funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { formatLlmResponse } from '../../domain/html.js';
import { dateStrToWeekRef } from '../../domain/timezone.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { getWeekId } from '../../services/plan-service.js';
import type { HandlerDeps } from './deps.js';

export async function handleDeclarationCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /declaration');
  ensureSession(ctx);
  ctx.session.declarationEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekRef = dateStrToWeekRef(userDateStr);
  const weekId = getWeekId(weekRef);
  const existing = await pool.query(
    'SELECT raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );

  if (existing.rows.length > 0) {
    ctx.session.step = 'declaration_choice';
    await ctx.reply('Declaration на эту неделю уже есть.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'declaration_show' },
        { text: 'Изменить', callback_data: 'declaration_edit' },
      ]],
    });
    return;
  }

  ctx.session.step = 'declaration_0';
  ctx.session.declarationAnswers = {};
  funnelStarted.inc({ type: 'declaration' });
  await ctx.reply(WEEKLY_DECLARATION_QUESTIONS[0].text);
}

export async function handleDeclarationShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Declaration show');
  ensureSession(ctx);
  ctx.session.step = undefined;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(dateStrToWeekRef(userDateStr));
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  const rawPost = row.rows[0]?.raw_post ?? '';
  await ctx.answerCallbackQuery();
  await ctx.reply(formatLlmResponse(rawPost) || 'Declaration пуст.', { parse_mode: 'HTML' });
}

export async function handleDeclarationEdit(ctx: AppContext): Promise<void> {
  ensureSession(ctx);
  await ctx.answerCallbackQuery();
  ctx.session.step = 'declaration_0';
  ctx.session.declarationEditMode = true;
  ctx.session.declarationAnswers = {};
  funnelStarted.inc({ type: 'declaration' });
  await ctx.reply(WEEKLY_DECLARATION_QUESTIONS[0].text);
}

export async function handleDeclarationMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { declarationService, handleLlmReply, formatErrorForUser } = deps;
  const userId = ctx.userId;
  const step = ctx.session!.step!;
  const idx = parseInt(step.replace('declaration_', ''), 10);
  const answers = ctx.session!.declarationAnswers ?? {};
  answers[WEEKLY_DECLARATION_QUESTIONS[idx].key as WeeklyDeclarationAnswerKey] = text;
  const record = answers as Record<WeeklyDeclarationAnswerKey, string>;

  if (idx >= WEEKLY_DECLARATION_QUESTIONS.length - 1) {
    ctx.session!.step = undefined;
    ctx.session!.declarationAnswers = undefined;
    const isEdit = ctx.session!.declarationEditMode ?? false;
    ctx.session!.declarationEditMode = undefined;

    try {
      if (isEdit) {
        const rawPost = await declarationService.updateDeclarationManual(userId, record);
        funnelCompleted.inc({ type: 'declaration' });
        logger.info({ userId }, 'Declaration manually updated');
        await ctx.reply('❗️ Declaration обновлён.\n\n' + formatLlmResponse(rawPost?.trim() || ''), {
          parse_mode: 'HTML',
        });
      } else {
        await ctx.reply('🟢 Готовлю declaration...');
        const rawPost = await declarationService.createDeclaration(userId, record);
        funnelCompleted.inc({ type: 'declaration' });
        logger.info({ userId }, 'Declaration created');
        await handleLlmReply(ctx, rawPost ?? '', userId, 'declaration');
      }
    } catch (err) {
      logger.error({ err, userId }, isEdit ? 'Declaration manual update failed' : 'Declaration creation failed');
      ctx.alertError?.(err, 'declaration', userId);
      await ctx.reply(formatErrorForUser(err));
    }
  } else {
    ctx.session!.step = `declaration_${idx + 1}`;
    await ctx.reply(WEEKLY_DECLARATION_QUESTIONS[idx + 1].text);
  }
}

export function registerDeclarationHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('declaration', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleDeclarationCommand(appCtx, deps);
  });
  bot.callbackQuery('declaration_show', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleDeclarationShow(appCtx, deps);
  });
  bot.callbackQuery('declaration_edit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleDeclarationEdit(appCtx);
  });
  bot.on('message:text').filter(
    (ctx) =>
      (ctx.session?.step?.startsWith('declaration_') ?? false) &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleDeclarationMessage(appCtx, ctx.message.text ?? '', deps);
    }
  );
}
