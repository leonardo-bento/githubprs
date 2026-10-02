import { randomUUID } from 'node:crypto';

export type LogContext = Record<string, string | number | boolean | undefined>;

function redact(text: string): string {
  let result = text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[redacted]');
  for (const token of [process.env.GITHUB_PAT, process.env.NEXT_PUBLIC_PAT]) {
    if (token) result = result.split(token).join('[redacted]');
  }
  return result;
}

export function writeLog(level: 'info' | 'error', event: string, context: LogContext, error?: unknown) {
  const details = error instanceof Error
    ? { error: error.message, stack: error.stack, code: (error as NodeJS.ErrnoException).code }
    : error !== undefined ? { error: String(error) } : {};
  const line = redact(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...context, ...details }));
  if (level === 'error') console.error(line);
  else console.info(line);
}

export function startRequestLog(request: Request) {
  const started = performance.now();
  const url = new URL(request.url);
  const context: LogContext = {
    requestId: randomUUID(), method: request.method, path: url.pathname,
    host: request.headers.get('host') || url.host, origin: request.headers.get('origin') || undefined,
  };
  writeLog('info', 'request.started', context);
  return {
    requestId: context.requestId as string,
    action(action: string, key?: string, revision?: number) {
      Object.assign(context, { action, key, revision });
    },
    error(event: string, error: unknown, extra: LogContext = {}) {
      writeLog('error', event, { ...context, ...extra }, error);
    },
    complete(status: number) {
      writeLog(status >= 400 ? 'error' : 'info', 'request.completed', {
        ...context, status, durationMs: Math.round(performance.now() - started),
      });
    },
  };
}
export type RequestLog = ReturnType<typeof startRequestLog>;
