import "server-only";
import { env } from "@/env";
import type { DbExecutor } from "@/server/db/executor";
import { outboxMessages } from "@/server/db/schema";
import { noteEnqueued } from "./after-commit";
import { seal } from "./seal";
import { TEMPLATES, type TemplateData, type TemplateName } from "./templates";

/**
 * enqueue(msg, tx) (CLAUDE.md §6): writes the message in the caller's transaction — if the business change rolls
 * back, no message exists; if it commits, the message cannot be lost. Nothing is sent here.
 */

const E164 = /^\+[1-9][0-9]{6,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface OutboxMessageInput<T extends TemplateName> {
  template: T;
  /** E.164 phone for SMS templates, email address for EMAIL templates. */
  recipient: string;
  data: TemplateData<T>;
  /** Secret values (e.g. `{ code }`) — encrypted at rest, removed after sending. */
  secrets?: Record<string, string>;
  /** After this time the message is never sent (expired OTPs are not retried). */
  expiresAt?: Date | null;
}

export async function enqueueMessage<T extends TemplateName>(
  tx: DbExecutor,
  msg: OutboxMessageInput<T>,
  keyHex: string = env.OUTBOX_ENCRYPTION_KEY
): Promise<{ id: string }> {
  const t = TEMPLATES[msg.template];
  const data = t.data.parse(msg.data);
  const recipient = msg.recipient.trim();
  if (t.channel === "SMS" ? !E164.test(recipient) : !EMAIL.test(recipient)) {
    throw new Error(`Outbox: invalid ${t.channel} recipient for ${msg.template}`);
  }
  const secrets = msg.secrets ?? {};
  for (const name of t.secrets) {
    if (!secrets[name]) throw new Error(`Outbox: ${msg.template} needs secret "${name}"`);
  }

  const payload = t.secrets.length > 0 ? { data, sealed: seal(secrets, keyHex) } : { data };
  const [row] = await tx
    .insert(outboxMessages)
    .values({
      channel: t.channel,
      recipient: t.channel === "EMAIL" ? recipient.toLowerCase() : recipient,
      template: msg.template,
      payload,
      expiresAt: msg.expiresAt ?? null,
    })
    .returning({ id: outboxMessages.id });
  noteEnqueued();
  return row;
}
