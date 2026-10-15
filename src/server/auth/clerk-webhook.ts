import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Clerk webhook verification (Gate 1b.8). Clerk signs webhooks the Svix way: headers `svix-id`, `svix-timestamp`,
 * `svix-signature` ("v1,<base64> v1,<base64> …"); the signature is HMAC-SHA256 over `${id}.${timestamp}.${body}`
 * with the secret after "whsec_" (base64). Pure and dependency-free, so it is unit-tested; lives in
 * src/server/auth with the rest of the Clerk code (CLAUDE.md §2).
 */

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export function signClerkWebhook(
  secret: string,
  id: string,
  timestamp: string,
  body: string
): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

/** True when one of the v1 signatures matches and the timestamp is within the tolerance. */
export function verifyClerkWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signClerkWebhook(secret, id, timestamp, body));
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The parts of a Clerk user event that SafeWaste uses (CLAUDE.md §4: email, phone, phone verification). */
export interface ClerkUserEvent {
  type: "user.created" | "user.updated" | "user.deleted";
  clerkUserId: string;
  fullName?: string | null;
  email: string | null;
  phoneE164: string | null;
  phoneVerified: boolean;
}

type RawUser = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: { id: string; email_address: string }[];
  primary_phone_number_id?: string | null;
  phone_numbers?: { id: string; phone_number: string; verification?: { status?: string } | null }[];
};

/** Reads a webhook body; null for event types SafeWaste does not use. */
export function parseClerkUserEvent(body: string): ClerkUserEvent | null {
  let evt: { type?: string; data?: RawUser };
  try {
    evt = JSON.parse(body);
  } catch {
    return null;
  }
  if (evt.type !== "user.created" && evt.type !== "user.updated" && evt.type !== "user.deleted")
    return null;
  const d = evt.data ?? {};
  if (!d.id) return null;
  const email =
    d.email_addresses?.find((e) => e.id === d.primary_email_address_id)?.email_address ?? null;
  const phone = d.phone_numbers?.find((p) => p.id === d.primary_phone_number_id) ?? null;
  const nameParts = [d.first_name, d.last_name].filter(Boolean);
  const fullName = nameParts.length ? nameParts.join(" ") : null;
  return {
    type: evt.type,
    clerkUserId: d.id,
    ...(fullName ? { fullName } : {}),
    email,
    phoneE164: phone?.phone_number ?? null,
    phoneVerified: phone?.verification?.status === "verified",
  };
}
