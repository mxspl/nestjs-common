import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, type LoggerService } from '@nestjs/common';

const correlation = new AsyncLocalStorage<string>();

export function withCorrelation<T>(
  id: string | undefined,
  callback: () => T,
): T {
  return correlation.run(
    id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : 'unknown',
    callback,
  );
}

@Injectable()
export class JsonLogger implements LoggerService {
  constructor(private level = 'log') {}

  setLevel(level: string) {
    this.level = level;
  }

  private write(level: string, message: unknown, context?: unknown) {
    const levels = ['debug', 'log', 'warn', 'error'];
    if (levels.indexOf(level) < levels.indexOf(this.level)) return;
    // Errors may contain credentials or payloads. Call sites supply static
    // messages; framework error objects are reduced to a generic label.
    const safeMessage =
      typeof message === 'string' ? message : 'Service operation failed';
    process.stdout.write(
      `${JSON.stringify({
        time: new Date().toISOString(),
        level,
        message: safeMessage,
        ...(typeof context === 'string' ? { context } : {}),
        correlationId: correlation.getStore(),
      })}\n`,
    );
  }

  log(message: unknown, context?: unknown) {
    this.write('log', message, context);
  }

  warn(message: unknown, context?: unknown) {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: unknown) {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: unknown) {
    this.write('debug', message, context);
  }

  error(message: unknown) {
    this.write('error', message);
  }

  fatal(message: unknown) {
    this.write('error', message);
  }
}
