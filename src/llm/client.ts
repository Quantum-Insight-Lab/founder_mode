/**
 * OpenAI client with idempotency (INV-006)
 */
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { getPool } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../observability/logger.js';
import { llmCallsTotal, llmCallLatency } from '../observability/metrics.js';
import { checkTokenSpike } from '../observability/token-spike.js';

export interface LLMResponse {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  model: string;
  latencyMs: number;
}

export type LLMCallType = 'declaration' | 'plan' | 'fixation' | 'review' | 'report';

export interface LLMOptions {
  idempotencyKey?: string;
  traceId?: string;
  userId?: string;
  callType?: LLMCallType;
}

const cfg = config().reliability;

export function createLLMClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const openai = new OpenAI({
    apiKey,
    timeout: cfg.llm_request_timeout_ms,
    maxRetries: cfg.llm_max_retries,
  });

  return {
    async complete(
      systemPrompt: string,
      userMessage: string,
      options: LLMOptions = {}
    ): Promise<LLMResponse> {
      const idempotencyKey = options.idempotencyKey ?? randomUUID();
      const traceId = options.traceId ?? randomUUID();

      const pool = getPool();
      const existing = await pool.query(
        'SELECT content, tokens_in, tokens_out, latency_ms FROM idempotency_cache WHERE idempotency_key = $1 AND expires_at > NOW()',
        [idempotencyKey]
      );

      const callType = options.callType ?? 'plan';

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        const cachedContent = row.content ?? '';
        if (cachedContent.trim()) {
          llmCallsTotal.inc({ model, cache_hit: 'true', type: callType });
          logger.info({ idempotencyKey, userId: options.userId }, 'LLM cache hit');
          return {
            content: cachedContent,
            usage: { prompt_tokens: row.tokens_in, completion_tokens: row.tokens_out },
            model,
            latencyMs: row.latency_ms,
          };
        }
      }

      logger.debug({ idempotencyKey, userId: options.userId }, 'LLM API call');
      const start = Date.now();
      const responseFormat =
        callType === 'report' || callType === 'declaration'
          ? ({ type: 'json_object' } as const)
          : ({ type: 'text' } as const);
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_completion_tokens: 4096,
        response_format: responseFormat,
      });
      const latencyMs = Date.now() - start;

      const choice = response.choices[0];
      const content = choice?.message?.content ?? '';
      const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
      if (!content?.trim()) {
        const refusal = (choice?.message as { refusal?: string })?.refusal;
        logger.error(
          { model, idempotencyKey, refusal, choice: JSON.stringify(choice) },
          'LLM returned empty content'
        );
        const hint = refusal?.trim()
          ? ` Модель отказала: ${refusal}`
          : '';
        throw new Error(`Модель не сформировала ответ. Обратитесь к разработчику @qip_okr${hint}`);
      }

      llmCallsTotal.inc({ model, cache_hit: 'false', type: callType });
      llmCallLatency.observe({ model, type: callType }, latencyMs / 1000);

      await pool.query(
        `INSERT INTO llm_calls (event_type, model, tokens_in, tokens_out, latency_ms, trace_id, idempotency_key, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          'chat_completion',
          model,
          usage.prompt_tokens,
          usage.completion_tokens,
          latencyMs,
          traceId,
          idempotencyKey,
          options.userId ?? null,
        ]
      );

      await pool.query(
        `INSERT INTO idempotency_cache (idempotency_key, content, tokens_in, tokens_out, latency_ms, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' hours')::interval)
         ON CONFLICT (idempotency_key) DO UPDATE SET content = EXCLUDED.content, expires_at = EXCLUDED.expires_at`,
        [
          idempotencyKey,
          content,
          usage.prompt_tokens,
          usage.completion_tokens,
          latencyMs,
          String(cfg.idempotency_key_ttl_hours),
        ]
      );

      checkTokenSpike().catch(() => {});

      return {
        content,
        usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens },
        model,
        latencyMs,
      };
    },
  };
}
