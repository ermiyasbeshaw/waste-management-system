import { AsyncLocalStorage } from "node:async_hooks";

/**
 * "Send right after commit" (architecture §11.1): a workflow transaction notes when it enqueued a message; after
 * the commit the dispatcher is started without waiting for it (best effort — the every-minute job is the backstop).
 */

const state = new AsyncLocalStorage<{ enqueued: boolean }>();

/** Called by `enqueueMessage` inside a workflow. */
export function noteEnqueued(): void {
  const s = state.getStore();
  if (s) s.enqueued = true;
}

export async function runThenKick<T>(
  work: () => Promise<T>,
  kick: () => Promise<unknown>,
  onKickError: (e: unknown) => void
): Promise<T> {
  const s = { enqueued: false };
  const result = await state.run(s, work); // throws → rolled back → nothing to send
  if (s.enqueued) void kick().catch(onKickError);
  return result;
}
