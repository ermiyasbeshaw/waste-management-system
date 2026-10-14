import { createHash } from "node:crypto";

/**
 * Hash chain of the audit log (CLAUDE.md §6). Each row's `hash` = SHA-256 over the canonical JSON of its content
 * plus the previous row's hash, so changing, removing or reordering any row breaks every hash after it.
 * Pure functions: shared by the writer and by `verifyAuditChain()`.
 */

export const AUDIT_HASH_VERSION = 1;

/** Advisory lock key that serialises audit inserts (used by the writer and the seed). */
export const AUDIT_CHAIN_LOCK_KEY = 7_310_001;

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface AuditHashInput {
  prevHash: string | null;
  actorUserId: string | null;
  role: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: JsonValue;
  after: JsonValue;
  ip: string | null;
  requestId: string | null;
  createdAt: Date;
}

/**
 * Turns any value into the JSON that Postgres `jsonb` will give back: Dates become ISO strings, bigints become
 * strings, `undefined` becomes null. Hash what is stored, not what was passed in.
 */
export function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  const text = JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "bigint" ? v.toString() : v
  );
  return text === undefined ? null : (JSON.parse(text) as JsonValue);
}

/** JSON with object keys sorted at every level (jsonb does not keep key order). */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

export function auditHash(input: AuditHashInput): string {
  const payload = canonicalJson({
    v: AUDIT_HASH_VERSION,
    prevHash: input.prevHash,
    actorUserId: input.actorUserId,
    role: input.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    ip: input.ip,
    requestId: input.requestId,
    createdAt: input.createdAt.toISOString(),
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Keys that must never reach the audit log (CLAUDE.md §9: never log OTPs or tokens). Compared without case and
 * underscores, so `code_hash`, `codeHash` and `CODE_HASH` all match.
 */
const SECRET_KEYS = new Set([
  "password",
  "secret",
  "otp",
  "otpcode",
  "plaincode",
  "codehash",
  "token",
  "tokenhash",
  "devicetoken",
]);
const isSecretKey = (key: string) => SECRET_KEYS.has(key.toLowerCase().replace(/_/g, ""));

/** Returns the path of the first secret-looking key in `value`, or null. */
export function findSecretKey(value: JsonValue, path = ""): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findSecretKey(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value)) {
    const here = path ? `${path}.${k}` : k;
    if (isSecretKey(k)) return here;
    const hit = findSecretKey(v, here);
    if (hit) return hit;
  }
  return null;
}
