import "server-only";
import { and, asc, eq, lte } from "drizzle-orm";
import { env } from "@/env";
import { withTransaction } from "@/server/db/client";
import type { DbExecutor } from "@/server/db/executor";
import { outboxMessages } from "@/server/db/schema";
import { getMessagingProviders, type MessagingProviders } from "@/server/integrations/messaging";
import { log } from "@/server/log";
import { getSetting } from "@/server/services/settings";
import { retryDelayMinutes } from "./retry";
import { unseal } from "./seal";
import { renderMessage } from "./templates";

/**
 * Outbox dispatcher (CLAUDE.md §6): sends PENDING messages whose time has come. Each message is handled in its
 * own transaction with `FOR UPDATE SKIP LOCKED`, so the after-commit kick and the every-minute job never send the
 * same message twice. Retries after 1 / 5 / 15 / 60 minutes until `outbox_max_attempts`, then FAILED (shown as an
 * alert on the admin dashboard). Expired messages (OTPs) are never sent or retried.
 *
 * ASSUMPTION: outbox status is technical state owned by this module — not a business status — so it does not
 * go through the Workflow Engine and sends are not written to the audit log (they are logged).
 */

export interface DispatchSummary {
  sent: number;
  retrying: number;
  failed: number;
  expired: number;
}

export interface DispatchOptions {
  limit?: number;
  now?: () => Date;
  providers?: MessagingProviders;
  executor?: DbExecutor;
  keyHex?: string;
}

type Payload = { data?: unknown; sealed?: string };

function errorText(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  return text.slice(0, 500);
}

export async function dispatchPending(options: DispatchOptions = {}): Promise<DispatchSummary> {
  const {
    limit = 50,
    now = () => new Date(),
    providers = getMessagingProviders(),
    executor,
    keyHex = env.OUTBOX_ENCRYPTION_KEY,
  } = options;
  // Each message in its own real transaction (dedicated connection); tests pass their own transaction instead.
  const inTx = <T>(fn: (tx: DbExecutor) => Promise<T>) =>
    executor ? executor.transaction(fn) : withTransaction(fn);
  const summary: DispatchSummary = { sent: 0, retrying: 0, failed: 0, expired: 0 };

  for (let i = 0; i < limit; i++) {
    const handled = await inTx(async (tx) => {
      const at = now();
      const [msg] = await tx
        .select()
        .from(outboxMessages)
        .where(and(eq(outboxMessages.status, "PENDING"), lte(outboxMessages.nextAttemptAt, at)))
        .orderBy(asc(outboxMessages.nextAttemptAt), asc(outboxMessages.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!msg) return false;

      const payload = (msg.payload ?? {}) as Payload;
      const withoutSecret = { data: payload.data ?? null };
      const finish = (values: Partial<typeof outboxMessages.$inferInsert>) =>
        tx.update(outboxMessages).set(values).where(eq(outboxMessages.id, msg.id));

      if (msg.expiresAt && msg.expiresAt <= at) {
        await finish({
          status: "FAILED",
          payload: withoutSecret,
          lastError: "Expired before it was sent",
        });
        summary.expired += 1;
        return true;
      }

      const attempts = msg.attempts + 1;
      let rendered;
      try {
        rendered = renderMessage(
          msg.template,
          payload.data,
          payload.sealed ? unseal(payload.sealed, keyHex) : {}
        );
      } catch (e) {
        // Not retryable: the stored message itself is broken.
        await finish({
          status: "FAILED",
          attempts,
          payload: withoutSecret,
          lastError: errorText(e),
        });
        log.error("Outbox message FAILED (cannot render)", e, {
          outboxId: msg.id,
          template: msg.template,
        });
        summary.failed += 1;
        return true;
      }

      try {
        const { providerRef } =
          rendered.channel === "SMS"
            ? await providers.sms.send(msg.recipient, rendered.text)
            : await providers.email.send({
                to: msg.recipient,
                subject: rendered.subject,
                html: rendered.html,
              });
        await finish({
          status: "SENT",
          attempts,
          sentAt: at,
          providerRef,
          lastError: null,
          payload: withoutSecret,
        });
        summary.sent += 1;
      } catch (e) {
        const maxAttempts = await getSetting("outbox_max_attempts", tx);
        if (attempts >= maxAttempts) {
          await finish({
            status: "FAILED",
            attempts,
            lastError: errorText(e),
            payload: withoutSecret,
          });
          log.error("Outbox message FAILED after max attempts", e, {
            outboxId: msg.id,
            template: msg.template,
            attempts,
          });
          summary.failed += 1;
        } else {
          const next = new Date(at.getTime() + retryDelayMinutes(attempts) * 60_000);
          await finish({ attempts, nextAttemptAt: next, lastError: errorText(e) });
          log.warn("Outbox send failed, will retry", {
            outboxId: msg.id,
            template: msg.template,
            attempts,
          });
          summary.retrying += 1;
        }
      }
      return true;
    });
    if (!handled) break;
  }
  return summary;
}
