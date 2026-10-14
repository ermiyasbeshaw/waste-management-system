import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts the secret part of an outbox message (the pickup OTP) with AES-256-GCM while it waits to be sent.
 * The dispatcher removes the sealed value once the message is SENT or FAILED, so no OTP stays in the database.
 * Format: "v1.<iv>.<tag>.<ciphertext>" (base64url). Pure: the key is passed in.
 */

const VERSION = "v1";

function keyBytes(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32)
    throw new Error("Outbox encryption key must be 32 bytes (64 hex characters)");
  return key;
}

export function seal(secret: Record<string, string>, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(keyHex), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(secret), "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function unseal(sealed: string, keyHex: string): Record<string, string> {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unknown sealed format");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(keyHex), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const text = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]);
  return JSON.parse(text.toString("utf8")) as Record<string, string>;
}
