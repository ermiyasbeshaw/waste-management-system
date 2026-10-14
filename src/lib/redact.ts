/**
 * Redaction for logs (CLAUDE.md §9): mask phone numbers, never log OTPs, tokens, passwords or secrets.
 * Pure module so it can be unit-tested and reused by any logger.
 */

/** Keys whose values are always removed, matched case-insensitively anywhere in the key. */
const SECRET_KEY =
  /otp|code[_-]?hash|token|password|passwd|secret|authorization|cookie|api[_-]?key|session/i;
/** Keys that hold a phone number. */
const PHONE_KEY = /phone|msisdn|mobile/i;

const POSTGRES_URL = /postgres(ql)?:\/\/[^\s"']+/gi;
const BEARER = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi;
const CLERK_KEY = /\b(sk|pk)_(test|live)_[A-Za-z0-9$_-]+/g;
const WEBHOOK_SECRET = /\bwhsec_[A-Za-z0-9+/=]+/g;
/** International (+2519…) or local (09…) phone numbers, with optional spaces or dashes. */
const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(?0?\d{2,3}\)?[\s-]?)\d{3}[\s-]?\d{3,4}\b/g;

/** "+251911457820" → "+2519******20": keeps the first 4 digits (country code + 1) and the last 2. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  const plus = phone.trim().startsWith("+") ? "+" : "";
  return `${plus}${digits.slice(0, 4)}${"*".repeat(digits.length - 6)}${digits.slice(-2)}`;
}

function redactString(s: string): string {
  return s
    .replace(POSTGRES_URL, "[REDACTED_DB_URL]")
    .replace(BEARER, "$1 [REDACTED]")
    .replace(CLERK_KEY, "[REDACTED_KEY]")
    .replace(WEBHOOK_SECRET, "[REDACTED_KEY]")
    .replace(PHONE, (m) => maskPhone(m));
}

/** Deep-copies `value` with secrets removed and phone numbers masked. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) out[k] = "[REDACTED]";
      else if (PHONE_KEY.test(k) && typeof v === "string") out[k] = maskPhone(v);
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
