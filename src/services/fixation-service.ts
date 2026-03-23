import type { EventStore } from '../events/event-store.js';
import { logger } from '../observability/logger.js';
import { getTraceId } from '../observability/trace.js';
import type { DomainEvent, FixationSubmittedPayload, FixationMovementBranch } from '../events/types.js';
import { EVENT_TYPES } from '../events/types.js';
import { prompts } from '../llm/prompts.js';
import { validateFixationDate, validateFixationBranch } from '../domain/validators.js';
import { getUserLocalDate } from '../db/user-timezone.js';
import { formatDayFull } from '../domain/date-format.js';
import { getWeekId } from './plan-service.js';
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
      thought_of_day: string;
      why_partial?: string;
      new_focus?: string;
    },
    variant: 'v1' | 'v2'
  ): Promise<string> {
    logger.debug({ userId, date: data.date, variant }, 'submitFixation');
    const had_movement = data.movement_branch === 'yes';
    validateFixationBranch(data);
    const todayStr = await getUserLocalDate(userId, pool);
    validateFixationDate(data.date, todayStr);
    const date = new Date(data.date + 'T12:00:00Z');
    const day = formatDayFull(date.getUTCDay());
    const weekId = getWeekId(date);
    const declarationRow = await pool.query<{ main_focus: string }>(
      'SELECT main_focus FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
      [userId, weekId]
    );
    let mainFocus = declarationRow.rows[0]?.main_focus;
    if (!mainFocus) {
      // Если пользователь выбрал дату из “пограничной” недели (когда declaration для этой недели
      // ещё не создан), не блокируем сбор фиксации: используем declaration текущей локальной недели.
      const todayWeekId = getWeekId(new Date(todayStr + 'T12:00:00Z'));
      const fallbackDeclarationRow = await pool.query<{ main_focus: string }>(
        'SELECT main_focus FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
        [userId, todayWeekId]
      );
      mainFocus = fallbackDeclarationRow.rows[0]?.main_focus;
    }
    if (!mainFocus) {
      throw new InvariantViolationError('Нужна declaration недели для фиксации', 'NOT_FOUND');
    }

    const payload: FixationSubmittedPayload = {
      user_id: userId,
      date: data.date,
      day,
      had_movement,
      movement_branch: data.movement_branch,
      thought_of_day: data.thought_of_day,
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
      userMessage = `День недели: ${day}\nДвижение по главному фокусу («${mainFocus}»): Да\nЧто продвинуло: ${data.what_moved ?? ''}\nДвижение вне фокуса: ${data.attention_sink ?? ''}\nШаг на завтра: ${data.tomorrow_step ?? ''}\nЧто стало понятнее к концу дня: ${data.thought_of_day}`;
    } else if (data.movement_branch === 'no') {
      userMessage = `День недели: ${day}\nДвижение по главному фокусу («${mainFocus}»): Нет\nЧто остановило: ${data.what_stopped ?? ''}\nЧто заняло внимание: ${data.attention_sink ?? ''}\nКак вернуть вектор завтра: ${data.tomorrow_step ?? ''}\nЧто стало понятнее к концу дня: ${data.thought_of_day}`;
    } else if (data.movement_branch === 'partial') {
      userMessage = `День недели: ${day}\nДвижение по главному фокусу («${mainFocus}»): Частично\nЧто удалось сделать: ${data.what_moved ?? ''}\nПочему движение частичное: ${data.why_partial ?? ''}\nЧто ещё заняло внимание: ${data.attention_sink ?? ''}\nСледующий шаг по фокусу: ${data.tomorrow_step ?? ''}\nЧто стало понятнее к концу дня: ${data.thought_of_day}`;
    } else {
      userMessage = `День недели: ${day}\nДвижение по главному фокусу («${mainFocus}»): Результат недели закрыт\nНовый фокус: ${data.new_focus ?? ''}\nЧто сделано по нему: ${data.what_moved ?? ''}\nСледующий шаг: ${data.tomorrow_step ?? ''}\nЧто стало понятнее к концу дня: ${data.thought_of_day ?? ''}`;
    }

    const idempotencyKey = `fixation:${userId}:${data.date}`;
    const prompt = variant === 'v2' ? prompts.dailyFixationV2(day) : prompts.dailyFixation(day);
    const response = await llm.complete(prompt, userMessage, {
      idempotencyKey,
      userId,
      traceId: getTraceId(),
      callType: 'fixation',
    });

    payload.raw_post = response.content;

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

    return response.content;
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
        thought_of_day: string;
        why_partial?: string;
        new_focus?: string;
      }
    ): Promise<string> {
      return submitFixationBase(userId, data, 'v1');
    },

    async submitFixationV2(
      userId: string,
      data: {
        date: string;
        movement_branch: FixationMovementBranch;
        had_movement?: boolean;
        what_moved?: string;
        tomorrow_step?: string;
        what_stopped?: string;
        attention_sink?: string;
        thought_of_day: string;
        why_partial?: string;
        new_focus?: string;
      }
    ): Promise<string> {
      return submitFixationBase(userId, data, 'v2');
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
        thought_of_day: string;
        why_partial?: string;
        new_focus?: string;
      }
    ): Promise<string> {
      logger.debug({ userId, date: data.date }, 'updateFixationManual');
      const had_movement = data.movement_branch === 'yes';
      validateFixationBranch(data);
      const todayStr = await getUserLocalDate(userId, pool);
      validateFixationDate(data.date, todayStr);
      const date = new Date(data.date + 'T12:00:00Z');
      const day = formatDayFull(date.getUTCDay());

      const existing = await pool.query<{ raw_post: string }>(
        'SELECT raw_post FROM daily_fixations WHERE user_id = $1 AND date = $2',
        [userId, data.date]
      );
      const originalRawPost = existing.rows[0]?.raw_post ?? '';

      const branchLabel =
        data.movement_branch === 'yes'
          ? 'Да'
          : data.movement_branch === 'no'
            ? 'Нет'
            : data.movement_branch === 'partial'
              ? 'Частично'
              : 'Результат недели закрыт';
      const lines: string[] = [
        '',
        '---',
        '❗️ Ручное редактирование ответов:',
        `Ветка: ${branchLabel}`,
      ];
      if (data.movement_branch === 'yes') {
        lines.push(`• Что продвинуло: ${data.what_moved ?? ''}`);
        lines.push(`• Движение вне фокуса: ${data.attention_sink ?? ''}`);
        lines.push(`• Шаг на завтра: ${data.tomorrow_step ?? ''}`);
      } else if (data.movement_branch === 'no') {
        lines.push(`• Что остановило: ${data.what_stopped ?? ''}`);
        lines.push(`• Что заняло внимание: ${data.attention_sink ?? ''}`);
        lines.push(`• Как вернуть вектор: ${data.tomorrow_step ?? ''}`);
      } else if (data.movement_branch === 'partial') {
        lines.push(`• Что удалось сделать: ${data.what_moved ?? ''}`);
        lines.push(`• Почему частично: ${data.why_partial ?? ''}`);
        lines.push(`• Что ещё заняло внимание: ${data.attention_sink ?? ''}`);
        lines.push(`• Следующий шаг по фокусу: ${data.tomorrow_step ?? ''}`);
      } else if (data.movement_branch === 'week_closed') {
        lines.push(`• Новый фокус: ${data.new_focus ?? ''}`);
        lines.push(`• Что сделано по нему: ${data.what_moved ?? ''}`);
        lines.push(`• Следующий шаг: ${data.tomorrow_step ?? ''}`);
      }
      lines.push(`• Что стало понятнее / мысль дня: ${data.thought_of_day}`);
      const newRawPost = originalRawPost + lines.join('\n');

      const payload: FixationSubmittedPayload = {
        user_id: userId,
        date: data.date,
        day,
        had_movement,
        movement_branch: data.movement_branch,
        thought_of_day: data.thought_of_day,
        raw_post: newRawPost,
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

      const idempotencyKey = `fixation:${userId}:${data.date}:manual`;
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

      return newRawPost;
    },
  };
}
