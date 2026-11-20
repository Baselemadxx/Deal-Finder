import { StructuredErrorInfo } from './types';

export interface LogContext {
  source?: string;
  county?: string;
  state?: string;
  [key: string]: unknown;
}

function emit(level: 'INFO' | 'WARN' | 'ERROR', message: string, context: LogContext = {}, err?: unknown) {
  const timestamp = new Date().toISOString();
  const payload: Record<string, unknown> = {
    timestamp,
    level,
    message,
    source: context.source ?? 'system',
    county: context.county ?? 'all',
    state: context.state ?? 'all',
    ...context,
  };

  if (err instanceof Error) {
    payload.errorName = err.name;
    payload.errorMessage = err.message;
    payload.stack = err.stack;
  } else if (err !== undefined) {
    payload.errorMessage = String(err);
  }

  const line = JSON.stringify(payload);
  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => emit('INFO', message, context),
  warn: (message: string, context?: LogContext) => emit('WARN', message, context),
  error: (message: string, context?: LogContext, err?: unknown) => emit('ERROR', message, context, err),
};

export function toStructuredError(
  err: unknown,
  meta: { source: string; county: string; state: string }
): StructuredErrorInfo {
  const timestamp = new Date().toISOString();
  if (err instanceof Error) {
    const anyErr = err as Error & { httpStatus?: number; code?: string };
    return {
      source: meta.source,
      county: meta.county,
      state: meta.state,
      timestamp,
      message: err.message,
      stack: err.stack,
      httpStatus: anyErr.httpStatus,
      code: anyErr.code,
    };
  }
  return {
    source: meta.source,
    county: meta.county,
    state: meta.state,
    timestamp,
    message: String(err),
  };
}
