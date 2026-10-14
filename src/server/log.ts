import "server-only";
import { redact } from "@/lib/redact";

/**
 * Structured JSON logger (CLAUDE.md §9, §13): one JSON object per line with level, message, request ID,
 * user ID and role. Every field passes through `redact` — phone numbers are masked, and OTPs, tokens,
 * passwords, secrets and connection strings never reach the log.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  userId?: string;
  role?: string;
  [key: string]: unknown;
}

function write(level: Level, message: string, context: LogContext = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: redact(message),
    ...(redact(context) as Record<string, unknown>),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  /** Logs the error name and message (redacted) and the stack, never the raw object. */
  error: (message: string, err?: unknown, context?: LogContext) =>
    write("error", message, {
      ...context,
      ...(err instanceof Error
        ? { errorName: err.name, errorMessage: err.message, stack: err.stack }
        : err !== undefined
          ? { error: String(err) }
          : {}),
    }),
};

/** A request ID for correlating logs and error responses. */
export function newRequestId(): string {
  return crypto.randomUUID();
}
