import type { EventStore } from '../events/event-store.js';
import { logger } from '../observability/logger.js';
import { getTraceId } from '../observability/trace.js';
import type { DomainEvent } from '../events/types.js';
import { EVENT_TYPES } from '../events/types.js';
import { prompts } from '../llm/prompts.js';
import type { ServiceDeps } from './deps.js';
import { dateStrToWeekRef } from '../domain/timezone.js';
import { formatDayFull } from '../domain/date-format.js';
import { getUserLocalDate } from '../db/user-timezone.js';
import { getWeekId } from './week-service.js';

interface DeclarationAnswers {
  main_focus: string;
  win_result: string;
  week_failure: string;
}

export interface DeclarationStructured {
  main_focus: string;
  win_result: string;
  week_failure: string;
}

function parseJsonCandidate(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const payload = fenced ? fenced[1] : trimmed;
  return JSON.parse(payload);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateStructuredDeclaration(raw: unknown): DeclarationStructured {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Declaration must be JSON object');
  }
  const record = raw as Record<string, unknown>;
  const main_focus = toNonEmptyString(record.main_focus);
  const win_result = toNonEmptyString(record.win_result);
  const week_failure = toNonEmptyString(record.week_failure);

  if (!main_focus || !win_result || !week_failure) {
    throw new Error('Declaration JSON missing required fields');
  }

  return { main_focus, win_result, week_failure };
}

function renderDeclarationCard(data: DeclarationStructured): string {
  return [
    'Приоритет недели',
    '',
    `Фокус: ${data.main_focus}.`,
    '',
    `Ожидаемый результат: ${data.win_result}.`,
    '',
    `Критерий неудачи: ${data.week_failure}.`,
  ].join('\n');
}

export function createDeclarationService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  return {
    async createDeclaration(
      userId: string,
      answers: DeclarationAnswers
    ): Promise<{ rawPost: string; structured: DeclarationStructured }> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const weekId = getWeekId(weekRef);
      const dayName = formatDayFull(new Date(`${userDateStr}T12:00:00Z`).getUTCDay());
      logger.debug({ userId, weekId, dayName }, 'createDeclaration');

      const userMessage = [
        `main_focus: ${answers.main_focus}`,
        `win_result: ${answers.win_result}`,
        `week_failure: ${answers.week_failure}`,
      ].join('\n');

      const idempotencyKey = `declaration:${userId}:${weekId}`;
      let structured: DeclarationStructured | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const attemptIdempotencyKey = attempt === 0 ? idempotencyKey : `${idempotencyKey}:retry_json_${attempt}`;
        const attemptUserMessage =
          attempt === 0
            ? userMessage
            : `${userMessage}\n\nВерни только валидный JSON-объект по схеме из system prompt. Без markdown и комментариев.`;
        const response = await llm.complete(prompts.weeklyDeclaration(dayName), attemptUserMessage, {
          idempotencyKey: attemptIdempotencyKey,
          userId,
          traceId: getTraceId(),
          callType: 'declaration',
        });
        try {
          const parsed = parseJsonCandidate(response.content ?? '');
          structured = validateStructuredDeclaration(parsed);
          break;
        } catch (err) {
          logger.warn({ err, userId, weekId, attempt }, 'Declaration JSON parse/validate failed');
        }
      }
      if (!structured) {
        throw new Error('Declaration: не удалось получить валидный JSON');
      }
      const renderedCard = renderDeclarationCard(structured);

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.DeclarationCreated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyDeclaration', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          main_focus: structured.main_focus,
          win_result: structured.win_result,
          week_failure: structured.week_failure,
          raw_post: renderedCard,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };

      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);

      return { rawPost: renderedCard, structured };
    },

    async updateDeclarationManual(userId: string, answers: DeclarationAnswers): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const weekId = getWeekId(weekRef);
      logger.debug({ userId, weekId }, 'updateDeclarationManual');
      const existing = await pool.query<{ raw_post: string }>(
        'SELECT raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
        [userId, weekId]
      );
      const originalRawPost = existing.rows[0]?.raw_post ?? '';
      const appendix = [
        '',
        '---',
        '❗️ Ручное редактирование ответов:',
        `• Фокус: ${answers.main_focus}`,
        `• Результат: ${answers.win_result}`,
        `• Критерий срыва: ${answers.week_failure}`,
      ].join('\n');
      const newRawPost = originalRawPost + appendix;

      const idempotencyKey = `declaration:${userId}:${weekId}:manual`;
      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.DeclarationUpdated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyDeclaration', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          main_focus: answers.main_focus,
          win_result: answers.win_result,
          week_failure: answers.week_failure,
          raw_post: newRawPost,
        },
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
