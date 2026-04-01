/**
 * Prometheus metrics (PDA 4.2)
 */
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

export const invariantViolations = new Counter({
  name: 'invariant_violations_total',
  help: 'Total invariant violations',
  labelNames: ['invariant_id'],
  registers: [register],
});

export const llmCallsTotal = new Counter({
  name: 'llm_calls_total',
  help: 'Total LLM API calls',
  labelNames: ['model', 'cache_hit', 'type'],
  registers: [register],
});

export const llmCallLatency = new Histogram({
  name: 'llm_call_latency_seconds',
  help: 'LLM call latency in seconds',
  labelNames: ['model', 'type'],
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const funnelStarted = new Counter({
  name: 'funnel_started_total',
  help: 'Funnel starts (first question shown)',
  labelNames: ['type'],
  registers: [register],
});

export const funnelCompleted = new Counter({
  name: 'funnel_completed_total',
  help: 'Completed funnel steps',
  labelNames: ['type'],
  registers: [register],
});

export const botOpens = new Counter({
  name: 'bot_opens_total',
  help: 'Bot /start command invocations',
  registers: [register],
});

export const cardEditClicks = new Counter({
  name: 'card_edit_clicks_total',
  help: 'Total clicks on "Edit" button for cards',
  labelNames: ['kind'],
  registers: [register],
});

export const experimentStarted = new Counter({
  name: 'experiment_started_total',
  help: 'Total experiment starts (CTA "Да")',
  registers: [register],
});

export const experimentCompleted = new Counter({
  name: 'experiment_completed_total',
  help: 'Total experiment completions (after first report CTA)',
  registers: [register],
});

// Default Node.js metrics (event loop, memory, etc.)
collectDefaultMetrics({ register });
