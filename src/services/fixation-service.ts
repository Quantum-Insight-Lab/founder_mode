import type { EventStore } from '../events/event-store.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../observability/logger.js';
import { getTraceId } from '../observability/trace.js';
import type { DomainEvent, FixationSubmittedPayload, FixationMovementBranch } from '../events/types.js';
import { EVENT_TYPES } from '../events/types.js';
import { prompts } from '../llm/prompts.js';
import { validateFixationDate, validateFixationBranch } from '../domain/validators.js';
import { getUserLocalDate } from '../db/user-timezone.js';
import { formatDayFull } from '../domain/date-format.js';
import { ensureDoubleNewlinesIfMultiline, stripTrailingDotsPerLine } from '../domain/text-format.js';
import { getWeekId } from './week-service.js';
import { InvariantViolationError } from '../domain/errors.js';
import type { ServiceDeps } from './deps.js';

export function createFixationService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function submitFixationBase(
    userId: string,
    data: {
      date: string;
      movement_branch: FixationMovementBranch;
      had_movement?: boolean;
      what_moved?: string;
      tomorrow_step?: string;
      what_stopped?: string;
      attention_sink?: string;
      why_partial?: string;
      new_focus?: string;
    },
    idempotencyKeyOverride?: string,
    skipDateValidation = false
  ): Promise<string> {
    logger.debug({ userId, date: data.date }, 'submitFixation');
    const had_movement = data.movement_branch === 'yes';
    validateFixationBranch(data);
    const todayStr = await getUserLocalDate(userId, pool);
    if (!skipDateValidation) {
      validateFixationDate(data.date, todayStr);
    }
    const date = new Date(data.date + 'T12:00:00Z');
    const day = formatDayFull(date.getUTCDay());
    const weekId = getWeekId(data.date);
    let declarationOk = (
      await pool.query('SELECT 1 FROM weekly_declarations WHERE user_id = $1 AND week_id = $2 LIMIT 1', [
        userId,
        weekId,
      ])
    ).rows.length > 0;
    if (!declarationOk) {
      // Дата из «пограничной» недели: допускаем фиксацию, если есть declaration текущей локальной недели.
      const todayWeekId = getWeekId(todayStr);
      declarationOk =
        (
          await pool.query('SELECT 1 FROM weekly_declarations WHERE user_id = $1 AND week_id = $2 LIMIT 1', [
            userId,
            todayWeekId,
          ])
        ).rows.length > 0;
    }
    if (!declarationOk) {
      throw new InvariantViolationError('Нужна declaration недели для фиксации', 'NOT_FOUND');
    }

    const payload: FixationSubmittedPayload = {
      user_id: userId,
      date: data.date,
      day,
      had_movement,
      movement_branch: data.movement_branch,
      raw_post: '', // will be set after LLM
    };
    if (data.movement_branch === 'yes') {
      payload.what_moved = data.what_moved;
      payload.attention_sink = data.attention_sink;
      payload.tomorrow_step = data.tomorrow_step;
    } else if (data.movement_branch === 'no') {
      payload.what_stopped = data.what_stopped;
      payload.attention_sink = data.attention_sink;
      payload.tomorrow_step = data.tomorrow_step;
    } else if (data.movement_branch === 'partial') {
      payload.what_moved = data.what_moved;
      payload.why_partial = data.why_partial;
      payload.attention_sink = data.attention_sink;
      payload.tomorrow_step = data.tomorrow_step;
    } else if (data.movement_branch === 'week_closed') {
      payload.new_focus = data.new_focus;
      payload.what_moved = data.what_moved;
      payload.tomorrow_step = data.tomorrow_step;
    }

    let userMessage: string;
    if (data.movement_branch === 'yes') {
      userMessage = `Движение по главному фокусу: Да\nЧто продвинуло: ${data.what_moved ?? ''}\nДвижение вне фокуса: ${data.attention_sink ?? ''}\nШаг на завтра: ${data.tomorrow_step ?? ''}`;
    } else if (data.movement_branch === 'no') {
      userMessage = `Движение по главному фокусу: Нет\nЧто остановило: ${data.what_stopped ?? ''}\nЧто заняло внимание: ${data.attention_sink ?? ''}\nКак вернуть вектор завтра: ${data.tomorrow_step ?? ''}`;
    } else if (data.movement_branch === 'partial') {
      userMessage = `Движение по главному фокусу: Частично\nЧто удалось сделать: ${data.what_moved ?? ''}\nПочему движение частичное: ${data.why_partial ?? ''}\nЧто ещё заняло внимание: ${data.attention_sink ?? ''}\nСледующий шаг по фокусу: ${data.tomorrow_step ?? ''}`;
    } else {
      userMessage = `Движение по главному фокусу: Результат недели закрыт\nНовый фокус: ${data.new_focus ?? ''}\nЧто сделано по нему: ${data.what_moved ?? ''}\nСледующий шаг: ${data.tomorrow_step ?? ''}`;
    }

    const idempotencyKey = idempotencyKeyOverride ?? `fixation:${userId}:${data.date}`;
    const prompt = prompts.dailyFixation();
    const response = await llm.complete(prompt, userMessage, {
      idempotencyKey,
      userId,
      traceId: getTraceId(),
      callType: 'fixation',
    });
    const rawPost = ensureDoubleNewlinesIfMultiline(stripTrailingDotsPerLine(response.content ?? ''));
    payload.raw_post = rawPost;

    const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
      event_type: EVENT_TYPES.FixationSubmitted,
      actor: { id: userId, role: 'user' },
      subject: { entity: 'DailyFixation', id: `${userId}:${data.date}` },
      payload,
      causation_id: null,
      correlation_id: null,
      idempotency_key: idempotencyKey,
      schema_version: 1,
    };

    const appended = await eventStore.append(event);
    await projectors.handleEvent(appended);

    return rawPost;
  }

  return {
    async submitFixation(
      userId: string,
      data: {
        date: string;
        movement_branch: FixationMovementBranch;
        had_movement?: boolean;
        what_moved?: string;
        tomorrow_step?: string;
        what_stopped?: string;
        attention_sink?: string;
        why_partial?: string;
        new_focus?: string;
      }
    ): Promise<string> {
      return submitFixationBase(userId, data);
    },

    async updateFixationManual(
      userId: string,
      data: {
        date: string;
        movement_branch: FixationMovementBranch;
        had_movement?: boolean;
        what_moved?: string;
        tomorrow_step?: string;
        what_stopped?: string;
        attention_sink?: string;
        why_partial?: string;
        new_focus?: string;
      }
    ): Promise<string> {
      logger.debug({ userId, date: data.date }, 'updateFixationManual');
      const existing = await pool.query('SELECT 1 FROM daily_fixations WHERE user_id = $1 AND date = $2 LIMIT 1', [
        userId,
        data.date,
      ]);
      if (existing.rows.length === 0) {
        throw new InvariantViolationError('Фиксация за этот день не найдена', 'NOT_FOUND');
      }
      const idempotencyKey = `fixation:${userId}:${data.date}:manual:${randomUUID()}`;
      return submitFixationBase(userId, data, idempotencyKey, true);
    },
  };
}
