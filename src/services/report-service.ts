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

interface ReportStructured {
  week_id: string;
  result_status: ResultStatus;
  result_fact: string;
  main_gap: string;
  next_step: string;
}

interface GeneratedReport {
  weekId: string;
  structured: ReportStructured;
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
         SELECT week_id FROM weekly_reports WHERE user_id = $1::uuid
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

function validateStructuredReport(raw: unknown, expectedWeekId: string): ReportStructured {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Report must be JSON object');
  }
  const record = raw as Record<string, unknown>;
  const result_status = normalizeResultStatus(record.result_status);
  const result_fact = toNonEmptyString(record.result_fact);
  const main_gap = toNonEmptyString(record.main_gap);
  const next_step = toNonEmptyString(record.next_step) ?? '';

  if (!result_status || !result_fact || !main_gap) {
    throw new Error('Report JSON missing required fields');
  }

  const rawWeekId = toNonEmptyString(record.week_id);
  if (rawWeekId && rawWeekId !== expectedWeekId) {
    logger.warn({ expectedWeekId, gotWeekId: rawWeekId }, 'Report week_id mismatch');
  }

  return {
    week_id: expectedWeekId,
    result_status,
    result_fact,
    main_gap,
    next_step,
  };
}

function renderReportCard(data: ReportStructured): string {
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

export function createReportService(eventStore: EventStore, deps: ServiceDeps) {
  const { pool, projectors, llm } = deps;

  async function generateReportFromData(
    userId: string,
    optionalUserNote: string,
    idempotencyKey: string
  ): Promise<GeneratedReport> {
    const userDateStr = await getUserLocalDate(userId, pool);
    const weekRef = dateStrToWeekRef(userDateStr);
    const weekId = getWeekId(weekRef);
    const weekCounter = await getUserWeekCounter(userId, weekId, pool);
    const { start, end } = getWeekStartEnd(weekRef);
    const dayName = formatDayFull(new Date(`${userDateStr}T12:00:00Z`).getUTCDay());
    logger.debug({ userId, weekId, weekCounter, dayName, start, end }, 'generateReportFromData');

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
      throw new InvariantViolationError('Нужна declaration недели для Report', 'NOT_FOUND');
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

    const basePrompt = prompts.weeklyReport(dayName, weekCounter);

    let structured: ReportStructured | null = null;
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
        callType: 'report',
      });
      try {
        const parsed = parseJsonCandidate(response.content ?? '');
        structured = validateStructuredReport(parsed, weekCounter);
        break;
      } catch (err) {
        logger.warn({ err, userId, weekId, attempt }, 'Report JSON parse/validate failed');
      }
    }

    if (!structured) {
      throw new InvariantViolationError('Report: не удалось получить валидный JSON', 'SERVICE_ERROR');
    }
    const renderedCard = renderReportCard(structured);
    return { weekId, structured, renderedCard };
  }

  return {
    async createReport(userId: string, optionalUserNote: string): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const weekId = getWeekId(weekRef);
      const idempotencyKey = `report:${userId}:${weekId}`;
      const { weekId: resolvedWeekId, structured, renderedCard } = await generateReportFromData(
        userId,
        optionalUserNote,
        idempotencyKey
      );

      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.ReportCreated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyReport', id: `${userId}:${resolvedWeekId}` },
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

    async updateReportManual(userId: string, optionalUserNote: string): Promise<string> {
      const userDateStr = await getUserLocalDate(userId, pool);
      const weekRef = dateStrToWeekRef(userDateStr);
      const weekId = getWeekId(weekRef);
      logger.debug({ userId, weekId }, 'updateReportManual');
      const idempotencyKey = `report:${userId}:${weekId}:manual`;
      const { structured, renderedCard } = await generateReportFromData(
        userId,
        optionalUserNote,
        idempotencyKey
      );
      const event: Omit<DomainEvent, 'event_id' | 'occurred_at'> = {
        event_type: EVENT_TYPES.ReportUpdated,
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyReport', id: `${userId}:${weekId}` },
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
