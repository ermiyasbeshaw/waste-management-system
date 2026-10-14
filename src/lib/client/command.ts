/**
 * Browser side of the operational commands (CLAUDE.md §6): every POST carries an `Idempotency-Key`. A caller keeps
 * the same key while it retries the same intended action (double tap, weak signal), so the server runs it once.
 */

export type CommandResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string; details: Record<string, unknown> };

export const newIdempotencyKey = () => crypto.randomUUID();

export async function postCommand<T>(
  url: string,
  body: unknown,
  idempotencyKey: string = newIdempotencyKey()
): Promise<CommandResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "NETWORK",
      message: "No connection. Try again — the same action will not be done twice.",
      details: {},
    };
  }
  const json = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string; details?: Record<string, unknown> };
  };
  if (res.ok) return { ok: true, status: res.status, data: json as T };
  return {
    ok: false,
    status: res.status,
    code: json.error?.code ?? "ERROR",
    message: json.error?.message ?? `Request failed (${res.status}).`,
    details: json.error?.details ?? {},
  };
}
