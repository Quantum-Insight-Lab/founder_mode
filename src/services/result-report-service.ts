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
import { getWeekId, getWeekStartEnd } from './plan-service.js';
import { InvariantViolationError } from '../domain/errors.js';

type ResultStatus = 'достигнут' | 'частично' | 'не достигнут';

interface ResultReportStructured {
  week_id: string;
  result_status: ResultStatus;
  result_fact: string;
  main_gap: string;
  next_step: string;
}

interface GeneratedResultReport {
  weekId: string;
  structured: ResultReportStructured;
  renderedCard: string;
}

async function getUserWeekCounter(userId: string, currentWeekId: string, pool: ServiceDeps['pool']): Promise<string> {
  const res = await pool.query<{ week_counter: string }>(
    `SELECT COUNT(*)::text AS week_counter
     FROM (
       SELECT DISTINCT week_id
       FROM (
         SELECT week_id FROM weekly_plans WHERE user_id = $1::uuid
         UNION ALL
         SELECT week_id FROM weekly_declarations WHERE user_id = $1::uuid
         UNION ALL
         SELECT week_id FROM weekly_result_reports WHERE user_id = $1::uuid
         UNION ALL
         SELECT week_id FROM weekly_reviews WHERE user_id = $1::uuid
       ) w
       WHERE week_id <= $2
     ) weeks`,
    [userId, currentWeekId]
  );
  const count = Number(res.rows[0]?.week_counter ?? '0');
  return `x${Math.max(1, count)}`;
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

function normalizeResultStatus(value: unknown): ResultStatus | null {
  const str = toNonEmptyString(value)?.toLowerCase();
  if (!str) return null;
  if (str === 'достигнут' || str.includes('достиг')) return 'достигнут';
  if (str === 'не достигнут' || str.includes('не достиг')) return 'не достигнут';
  if (str === 'частично' || str.includes('частич')) return 'частично';
  return null;
}

function validateStructuredResult(raw: unknown, expectedWeekId: string): ResultReportStructured {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Result report must be JSON object');
  }
  const record = raw as Record<string, unknown>;
  const result_status = normalizeResultStatus(record.result_status);
  const result_fact = toNonEmptyString(record.result_fact);
  const main_gap = toNonEmptyString(record.main_gap);
  const next_step = toNonEmptyString(record.next_step) ?? '';

  if (!result_status || !result_fact || !main_gap) {
    throw new Error('Result report JSON missing required fields');
  }

  const rawWeekId = toNonEmptyString(record.week_id);
  if (rawWeekId && rawWeekId !== expectedWeekId) {
    logger.warn({ expectedWeekId, gotWeekId: rawWeekId }, 'Result report week_id mismatch');
  }

  return {
    week_id: expectedWeekId,
    result_status,
    result_fact,
    main_gap,
    next_step,
  };
}

function renderResultReportCard(data: ResultReportStructured): string {
  return [
    `Неделя ${data.week_id}`,
    '',
    `Результат ${data.result_status}.`,
    '',
    data.result_fact,
    '',
    'Главный разрыв —',
    data.main_gap,
  ].join('\n');
}

export function createResultReportService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function generateResultReportFromData(
    userId: string,
    optionalUserNote: string,
    idempotencyKey: string
  ): Promise<GeneratedResultReport> {
    const userDateStr = await getUserLocalDate(userId, pool);
    const weekRef = dateStrToWeekRef(userDateStr);
    const weekId = getWeekId(weekRef);
    const weekCounter = await getUserWeekCounter(userId, weekId, pool);
    const { start, end } = getWeekStartEnd(weekRef);
    const dayName = formatDayFull(new Date(`${userDateStr}T12:00:00Z`).getUTCDay());
    logger.debug({ userId, weekId, weekCounter, dayName, start, end }, 'generateResultReportFromData');

    const declarationRow = await pool.query<{
      main_focus: string;
      win_result: string;
      week_failure: string;
    }>(
      `SELECT main_focus, win_result, week_failure
       FROM weekly_declarations
       WHERE user_id = $1 AND week_id = $2`,
      [userId, weekId]
    );
    const declaration = declarationRow.rows[0];
    if (!declaration) {
      throw new InvariantViolationError('Нужна declaration недели для Result Report', 'NOT_FOUND');
    }

    const reflectionsRow = await pool.query<{
      day: string;
      had_movement: boolean;
      movement_branch: string | null;
      what_moved: string | null;
      tomorrow_step: string | null;
      what_stopped: string | null;
      attention_sink: string | null;
      thought_of_day: string;
      why_partial: string | null;
      new_focus: string | null;
    }>(
      `SELECT day, had_movement, movement_branch, what_moved, tomorrow_step, what_stopped,
              attention_sink, thought_of_day, why_partial, new_focus
       FROM daily_reflections
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date`,
      [userId, start, end]
    );

    const input = {
      WEEKLY_DECLARATION: declaration,
      daily_reflections: reflectionsRow.rows,
      optional_user_note: optionalUserNote,
    };
    const userMessage = JSON.stringify(input, null, 2);

    const basePrompt = prompts.weeklyResultReport(dayName, weekCounter);

    let structured: ResultReportStructured | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptIdempotencyKey = attempt === 0 ? idempotencyKey : `${idempotencyKey}:retry_json_${attempt}`;
      const attemptUserMessage =
        attempt === 0
          ? userMessage
          : `${userMessage}\n\nВерни только валидный JSON-объект по схеме из system prompt. Без markdown и комментариев.`;
      const response = await llm.complete(basePrompt, attemptUserMessage, {
        idempotencyKey: attemptIdempotencyKey,
        userId,
        traceId: getTraceId(),
        callType: 'result_report',
      });
      try {
        const parsed = parseJsonCandidate(response.content ?? '');
        structured = validateStructuredResult(parsed, weekCounter);
        break;
      } catch (err) {
        logger.warn({ err, userId, weekId, attempt }, 'Result report JSON parse/validate failed');
      }
    }

    if (!structured) {
      throw new InvariantViolationError('Result Report: не удалось получить валидный JSON', 'SERVICE_ERROR');
    }
    const renderedCard = renderResultReportCard(structured);
    return { weekId, structured, renderedCard };
  }

  return {
    async createResultReport(userId: string, optionalUserNote: string): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const weekId = getWeekId(weekRef);
      const idempotencyKey = `result_report:${userId}:${weekId}`;
      const { weekId: resolvedWeekId, structured, renderedCard } = await generateResultReportFromData(
        userId,
        optionalUserNote,
        idempotencyKey
      );

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.ResultReportCreated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyResultReport', id: `${userId}:${resolvedWeekId}` },
        payload: {
          user_id: userId,
          week_id: resolvedWeekId,
          result_status: structured.result_status,
          result_fact: structured.result_fact,
          main_gap: structured.main_gap,
          next_step: structured.next_step,
          raw_post: renderedCard,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };

      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);
      return renderedCard;
    },

    async updateResultReportManual(userId: string, optionalUserNote: string): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const weekId = getWeekId(weekRef);
      logger.debug({ userId, weekId }, 'updateResultReportManual');
      const idempotencyKey = `result_report:${userId}:${weekId}:manual`;
      const { structured, renderedCard } = await generateResultReportFromData(
        userId,
        optionalUserNote,
        idempotencyKey
      );
      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.ResultReportUpdated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyResultReport', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          result_status: structured.result_status,
          result_fact: structured.result_fact,
          main_gap: structured.main_gap,
          next_step: structured.next_step,
          raw_post: renderedCard,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      };
      const appended = await eventStore.append(event);
      await projectors.handleEvent(appended);
      return renderedCard;
    },
  };
}
