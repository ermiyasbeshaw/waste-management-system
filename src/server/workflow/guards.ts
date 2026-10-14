import { AppError } from "@/server/errors";
import type { DbExecutor } from "@/server/db/executor";
import type { Actor, Entity, StatusOf } from "./table";

/**
 * Guards (architecture §7.5 "Guard (must be true)"): business checks a move needs beyond the table — e.g. "no
 * container is COLLECTED", "every expected container is scanned", "the driver holds the current assignment".
 * A guard runs inside the engine's transaction after the row is locked, and throws an AppError to refuse.
 * The services that own each workflow define their guards (Gates 3–6); the engine only runs them in order.
 */
export interface GuardContext<E extends Entity = Entity> {
  tx: DbExecutor;
  entity: E;
  id: string;
  /** The locked row as stored (snake_case column names). */
  row: Readonly<Record<string, unknown>>;
  from: StatusOf<E>;
  to: StatusOf<E>;
  actor: Actor;
  reason: string | null;
}

export type Guard<E extends Entity = Entity> = (ctx: GuardContext<E>) => void | Promise<void>;

/** Refuses the move with 409 GUARD_FAILED (or another code) unless `condition` holds. */
export function ensure(
  condition: boolean,
  message: string,
  code = "GUARD_FAILED",
  details: Record<string, unknown> = {}
): asserts condition {
  if (!condition) throw new AppError(code, 409, message, details);
}

export async function runGuards<E extends Entity>(
  guards: readonly Guard<E>[],
  ctx: GuardContext<E>
): Promise<void> {
  for (const guard of guards) await guard(ctx);
}
