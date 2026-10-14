import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps, tsz } from "./_common";
import { outboxChannel, outboxStatus, userRole } from "./enums";
import { users } from "./users";

/**
 * Audit log (CLAUDE.md §6): INSERT-only — a trigger blocks UPDATE, DELETE and TRUNCATE. Hash chain
 * (`prev_hash` → `hash`, SHA-256 hex) written by the audit writer (Gate 2.5) under an advisory lock.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    // Chain order: assigned while the writer holds the advisory lock, so seq order = chain order.
    seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    role: userRole("role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    requestId: text("request_id"),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_created_at_idx").on(t.createdAt.desc()),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    uniqueIndex("audit_logs_hash_unique").on(t.hash),
    uniqueIndex("audit_logs_seq_unique").on(t.seq),
    // One first entry (prev_hash NULL) and one successor per entry: the chain cannot fork.
    unique("audit_logs_prev_hash_unique").on(t.prevHash).nullsNotDistinct(),
    check("audit_logs_action_format", sql`${t.action} ~ '^[a-z][a-z0-9_.]{1,63}$'`),
    check("audit_logs_hash_format", sql`${t.hash} ~ '^[0-9a-f]{64}$'`),
    check(
      "audit_logs_prev_hash_format",
      sql`${t.prevHash} IS NULL OR ${t.prevHash} ~ '^[0-9a-f]{64}$'`
    ),
  ]
);

/**
 * Counters for human codes (CLAUDE.md §9, `src/lib/codes.ts`): one row per kind and period. The next number is
 * taken with one atomic upsert inside the caller's transaction, so concurrent requests never share a number.
 */
export const codeSequences = pgTable(
  "code_sequences",
  {
    scope: text("scope").notNull(),
    period: text("period").notNull(),
    lastValue: integer("last_value").notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ name: "code_sequences_pkey", columns: [t.scope, t.period] }),
    check(
      "code_sequences_scope",
      sql`${t.scope} IN ('waste', 'trip', 'certificate', 'invoice', 'contract', 'medicine_request')`
    ),
    check("code_sequences_period_format", sql`${t.period} ~ '^[0-9]{4}(-?[0-9]{2}){0,2}$'`),
    check("code_sequences_last_value_min", sql`${t.lastValue} >= 1`),
  ]
);

/**
 * Outbox (CLAUDE.md §6): every SMS / email is written here in the same transaction as the business change and
 * sent later by the dispatcher with retries. OTP messages carry `expires_at` and are never retried after it.
 */
export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: id(),
    channel: outboxChannel("channel").notNull(),
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    payload: jsonb("payload").notNull(),
    status: outboxStatus("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: tsz("next_attempt_at").notNull().defaultNow(),
    expiresAt: tsz("expires_at"),
    lastError: text("last_error"),
    providerRef: text("provider_ref"),
    sentAt: tsz("sent_at"),
    ...timestamps,
  },
  (t) => [
    index("outbox_messages_status_next_idx").on(t.status, t.nextAttemptAt),
    check("outbox_messages_attempts_min", sql`${t.attempts} >= 0`),
    check("outbox_messages_sent_at", sql`(${t.status} = 'SENT') = (${t.sentAt} IS NOT NULL)`),
    check("outbox_messages_template_format", sql`${t.template} ~ '^[a-z][a-z0-9_.]{1,63}$'`),
  ]
);

/**
 * Idempotency keys (CLAUDE.md §6): checked and stored inside the same transaction as the action; a replay
 * within 24 h returns the stored response. Unique per user + route + key (NULL user = system jobs).
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: id(),
    key: text("key").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    route: text("route").notNull(),
    // SHA-256 of the canonical request body: the same key with a different body is refused, not replayed.
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("idempotency_keys_user_route_key_unique")
      .on(t.userId, t.route, t.key)
      .nullsNotDistinct(),
    index("idempotency_keys_created_at_idx").on(t.createdAt),
    check("idempotency_keys_request_hash_format", sql`${t.requestHash} ~ '^[0-9a-f]{64}$'`),
    check("idempotency_keys_key_format", sql`${t.key} ~ '^[A-Za-z0-9_-]{8,128}$'`),
    check(
      "idempotency_keys_status_range",
      sql`${t.responseStatus} IS NULL OR ${t.responseStatus} BETWEEN 100 AND 599`
    ),
  ]
);
