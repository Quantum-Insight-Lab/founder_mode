/**
 * AsyncLocalStorage for trace_id correlation (PDA 4.2)
 */
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface TraceContext {
  traceId: string;
}

export const traceStore = new AsyncLocalStorage<TraceContext>();

export function getTraceId(): string | undefined {
  return traceStore.getStore()?.traceId;
}

export function runWithTrace<T>(traceId: string, fn: () => T): T {
  return traceStore.run({ traceId }, fn);
}

export function runWithNewTrace<T>(fn: () => T): T {
  return runWithTrace(randomUUID(), fn);
}
