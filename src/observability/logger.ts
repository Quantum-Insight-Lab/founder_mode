import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { getTraceId } from './trace.js';

const stream =
  process.env.NODE_ENV === 'development'
    ? (pinoPretty as unknown as (opts?: object) => NodeJS.WritableStream)({ colorize: true })
    : process.stdout;

const baseLogger = (pino as unknown as (opts: object, stream?: NodeJS.WritableStream) => import('pino').Logger)(
  { level: process.env.LOG_LEVEL ?? 'info' },
  stream
);

/** Logger that injects trace_id from AsyncLocalStorage when available */
function bindTraceId(obj: object): object {
  const traceId = getTraceId();
  return traceId ? { ...obj, trace_id: traceId } : obj;
}

export const logger = {
  info: (obj: object | string, msg?: string) =>
    typeof obj === 'string' ? baseLogger.info(bindTraceId({}), obj) : baseLogger.info(bindTraceId(obj), msg ?? ''),
  debug: (obj: object | string, msg?: string) =>
    typeof obj === 'string' ? baseLogger.debug(bindTraceId({}), obj) : baseLogger.debug(bindTraceId(obj), msg ?? ''),
  warn: (obj: object | string, msg?: string) =>
    typeof obj === 'string' ? baseLogger.warn(bindTraceId({}), obj) : baseLogger.warn(bindTraceId(obj), msg ?? ''),
  error: (obj: object | string, msg?: string) =>
    typeof obj === 'string' ? baseLogger.error(bindTraceId({}), obj) : baseLogger.error(bindTraceId(obj), msg ?? ''),
  child: (bindings: object) => baseLogger.child(bindings),
};
