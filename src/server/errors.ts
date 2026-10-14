import { ZodError } from "zod";
import { log } from "@/server/log";

/**
 * Typed application errors (CLAUDE.md §9): services throw `AppError(code, httpStatus)`; one handler turns
 * any thrown value into `{ error: { code, message, details } }`. Unexpected errors become a generic 500 —
 * their message and stack are logged with the request ID, never sent to the client.
 */

export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS | (string & {});

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    httpStatus?: number,
    message?: string,
    details: Record<string, unknown> = {}
  ) {
    super(message ?? defaultMessage(code));
    this.name = "AppError";
    this.code = code;
    this.httpStatus =
      httpStatus ?? (ERROR_STATUS as Record<string, number>)[code] ?? ERROR_STATUS.INTERNAL_ERROR;
    this.details = details;
  }
}

function defaultMessage(code: ErrorCode): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "You need to sign in.";
    case "FORBIDDEN":
      return "You do not have permission to do this.";
    case "NOT_FOUND":
      return "Not found.";
    case "INVALID_TRANSITION":
      return "This status change is not allowed.";
    case "VALIDATION_ERROR":
      return "Some fields are invalid.";
    case "RATE_LIMITED":
      return "Too many requests. Please wait and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> };
}

/** Maps any thrown value to an HTTP status and the API error body. */
export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.httpStatus,
      body: { error: { code: String(err.code), message: err.message, details: err.details } },
    };
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    return {
      status: ERROR_STATUS.VALIDATION_ERROR,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: defaultMessage("VALIDATION_ERROR"),
          details: { fields },
        },
      },
    };
  }
  return {
    status: ERROR_STATUS.INTERNAL_ERROR,
    body: {
      error: { code: "INTERNAL_ERROR", message: defaultMessage("INTERNAL_ERROR"), details: {} },
    },
  };
}

/** Route Handler helper: JSON error response with the request ID header. Unexpected errors (5xx) are logged. */
export function errorResponse(err: unknown, requestId?: string): Response {
  const { status, body } = toErrorBody(err);
  if (status >= 500) {
    const cause = (err as { cause?: unknown } | null)?.cause;
    log.error("Request failed", err, {
      requestId,
      cause: cause instanceof Error ? cause.message : cause ? String(cause) : undefined,
    });
  }
  return Response.json(body, {
    status,
    headers: requestId ? { "x-request-id": requestId } : undefined,
  });
}
