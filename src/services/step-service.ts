import type { EventStore } from '../events/event-store.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../observability/logger.js';
import { getTraceId } from '../observability/trace.js';
import type { DomainEvent, MatterStepSubmittedPayload, MatterStepMovementBranch } from '../events/types.js';
import { EVENT_TYPES } from '../events/types.js';
import { prompts } from '../llm/prompts.js';
import { validateFixationDate, validateStepBranch } from '../domain/validators.js';
import { getUserLocalDate } from '../db/user-timezone.js';
import { formatDayFull } from '../domain/date-format.js';
import {
  ensureDoubleNewlinesIfMultiline,
  lowercaseFirstLetterAfterColonPerLine,
  stripTrailingDotsPerLine,
} from '../domain/text-format.js';
import { getWeekId } from './week-service.js';
import { InvariantViolationError } from '../domain/errors.js';
import type { ServiceDeps } from './deps.js';

export function createStepService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function submitStepBase(
    userId: string,
    data: {
      date: string;
      movement_branch: MatterStepMovementBranch;
      had_movement?: boolean;
      what_moved?: string;
      tomorrow_step?: string;
      what_stopped?: string;
      avoidance?: string;
      why_partial?: string;
    },
    idempotencyKeyOverride?: string,
    skipDateValidation = false,
    source: 'initial' | 'manual' = 'initial'
  ): Promise<string> {
    logger.debug({ userId, date: data.date }, 'submitStep');
    const had_movement = data.movement_branch === 'yes';
    validateStepBranch(data);
    const todayStr = await getUserLocalDate(userId, pool);
    if (!skipDateValidation) {
      validateFixationDate(data.date, todayStr);
    }
    const date = new Date(data.date + 'T12:00:00Z');
    const day = formatDayFull(date.getUTCDay());
    const weekId = getWeekId(data.date);
    let matterOk =
      (await pool.query('SELECT 1 FROM weekly_matters WHERE user_id = $1 AND week_id = $2 LIMIT 1', [userId, weekId]))
        .rows.length > 0;
    if (!matterOk) {
      const todayWeekId = getWeekId(todayStr);
      matterOk =
        (
          await pool.query('SELECT 1 FROM weekly_matters WHERE user_id = $1 AND week_id = $2 LIMIT 1', [
            userId,
            todayWeekId,
          ])
        ).rows.length > 0;
    }
    if (!matterOk) {
      throw new InvariantViolationError('Нужно дело недели для шага. Напиши /matter', 'NOT_FOUND');
    }

    const payload: MatterStepSubmittedPayload = {
      user_id: userId,
      date: data.date,
      day,
      had_movement,
      movement_branch: data.movement_branch,
      raw_post: '',
      source,
    };
    if (data.movement_branch === 'yes') {
      payload.what_moved = data.what_moved;
      payload.tomorrow_step = data.tomorrow_step;
    } else if (data.movement_branch === 'no') {
      payload.what_stopped = data.what_stopped;
      payload.avoidance = data.avoidance;
      payload.tomorrow_step = data.tomorrow_step;
    } else if (data.movement_branch === 'partial') {
      payload.what_moved = data.what_moved;
      payload.why_partial = data.why_partial;
      payload.tomorrow_step = data.tomorrow_step;
    }

    let userMessage: string;
    if (data.movement_branch === 'yes') {
      userMessage = `Шаг к закрытию: Да\nЧто сделано: ${data.what_moved ?? ''}\nМикрошаг на завтра: ${data.tomorrow_step ?? ''}`;
    } else if (data.movement_branch === 'no') {
      userMessage = `Шаг к закрытию: Нет\nЧто помешало: ${data.what_stopped ?? ''}\nЧем отвлекался: ${data.avoidance ?? ''}\nМикрошаг на завтра: ${data.tomorrow_step ?? ''}`;
    } else {
      userMessage = `Шаг к закрытию: Частично\nЧто сделано: ${data.what_moved ?? ''}\nПочему частично: ${data.why_partial ?? ''}\nМикрошаг на завтра: ${data.tomorrow_step ?? ''}`;
    }

    const idempotencyKey = idempotencyKeyOverride ?? `step:${userId}:${data.date}`;
    const response = await llm.complete(prompts.step(), userMessage, {
      idempotencyKey,
      userId,
      traceId: getTraceId(),
      callType: 'step',
    });
    const rawPost = ensureDoubleNewlinesIfMultiline(
      lowercaseFirstLetterAfterColonPerLine(stripTrailingDotsPerLine(response.content ?? ''))
    );
    payload.raw_post = rawPost;

    const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
      event_type: EVENT_TYPES.MatterStepSubmitted,
      actor: { id: userId, role: 'user' },
      subject: { entity: 'MatterStep', id: `${userId}:${data.date}` },
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
    async submitStep(
      userId: string,
      data: {
        date: string;
        movement_branch: MatterStepMovementBranch;
        had_movement?: boolean;
        what_moved?: string;
        tomorrow_step?: string;
        what_stopped?: string;
        avoidance?: string;
        why_partial?: string;
      }
    ): Promise<string> {
      return submitStepBase(userId, data);
    },

    async updateStepManual(
      userId: string,
      data: {
        date: string;
        movement_branch: MatterStepMovementBranch;
        had_movement?: boolean;
        what_moved?: string;
        tomorrow_step?: string;
        what_stopped?: string;
        avoidance?: string;
        why_partial?: string;
      }
    ): Promise<string> {
      logger.debug({ userId, date: data.date }, 'updateStepManual');
      const existing = await pool.query('SELECT 1 FROM matter_steps WHERE user_id = $1 AND date = $2 LIMIT 1', [
        userId,
        data.date,
      ]);
      if (existing.rows.length === 0) {
        throw new InvariantViolationError('Шаг за этот день не найден', 'NOT_FOUND');
      }
      const idempotencyKey = `step:${userId}:${data.date}:manual:${randomUUID()}`;
      return submitStepBase(userId, data, idempotencyKey, true, 'manual');
    },
  };
}
