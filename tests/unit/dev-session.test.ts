import { createHmac, randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEV_SESSION_TTL_SECONDS,
  checkDevPassword,
  createDevSessionToken,
  verifyDevSessionToken,
} from "@/server/auth/dev-session";
import { DEV_ACCOUNTS, type DevAccount } from "@/server/auth/dev-accounts.generated";
import { USER_ROLES } from "@/server/auth/access-rules";

// A throw-away account so the tests never need the real generated passwords.
function account(username: string, role: DevAccount["role"], password: string): DevAccount {
  const salt = randomBytes(16).toString("hex");
  return { username, role, salt, hash: scryptSync(password, salt, 64).toString("hex") };
}
const ACCOUNTS = [
  account("sw_test", "driver", "correct horse"),
  account("sw_other", "efda_officer", "x"),
];
const SECRET = "s".repeat(64);
const NOW = 1_800_000_000;

describe("generated dashboard accounts", () => {
  it("has exactly one login per role, with hashes only", () => {
    expect(DEV_ACCOUNTS.map((a) => a.role).sort()).toEqual([...USER_ROLES].sort());
    for (const a of DEV_ACCOUNTS) {
      expect(a.hash).toMatch(/^[0-9a-f]{128}$/);
      expect(a.salt).toMatch(/^[0-9a-f]{32}$/);
      expect(Object.keys(a).sort()).toEqual(["hash", "role", "salt", "username"]);
    }
  });
});

describe("checkDevPassword", () => {
  it("accepts the right password (username is case-insensitive) and rejects others", () => {
    expect(checkDevPassword(ACCOUNTS, "sw_test", "correct horse")?.role).toBe("driver");
    expect(checkDevPassword(ACCOUNTS, " SW_TEST ", "correct horse")?.username).toBe("sw_test");
    expect(checkDevPassword(ACCOUNTS, "sw_test", "wrong")).toBeNull();
    expect(checkDevPassword(ACCOUNTS, "sw_other", "correct horse")).toBeNull();
    expect(checkDevPassword(ACCOUNTS, "nobody", "correct horse")).toBeNull();
  });
});

describe("signed session cookie", () => {
  const token = createDevSessionToken({ username: "sw_test", role: "driver" }, SECRET, NOW);

  it("round-trips while valid", () => {
    expect(verifyDevSessionToken(token, SECRET, ACCOUNTS, NOW + 60)).toEqual({
      username: "sw_test",
      role: "driver",
      exp: NOW + DEV_SESSION_TTL_SECONDS,
    });
  });

  it("rejects a wrong secret, a tampered payload, garbage and a missing cookie", () => {
    expect(verifyDevSessionToken(token, "t".repeat(64), ACCOUNTS, NOW)).toBeNull();
    const [, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ username: "sw_test", role: "super_admin", exp: NOW + 999 })
    ).toString("base64url");
    expect(verifyDevSessionToken(`${forged}.${sig}`, SECRET, ACCOUNTS, NOW)).toBeNull();
    expect(verifyDevSessionToken("not-a-token", SECRET, ACCOUNTS, NOW)).toBeNull();
    expect(verifyDevSessionToken(`${token}.extra`, SECRET, ACCOUNTS, NOW)).toBeNull();
    expect(verifyDevSessionToken(undefined, SECRET, ACCOUNTS, NOW)).toBeNull();
  });

  it("expires after 12 hours", () => {
    expect(
      verifyDevSessionToken(token, SECRET, ACCOUNTS, NOW + DEV_SESSION_TTL_SECONDS)
    ).toBeNull();
  });

  it("is invalid once the account is removed or its role changes (regenerated accounts)", () => {
    expect(verifyDevSessionToken(token, SECRET, [ACCOUNTS[1]], NOW)).toBeNull();
    const changed = [{ ...ACCOUNTS[0], role: "efda_officer" as const }];
    expect(verifyDevSessionToken(token, SECRET, changed, NOW)).toBeNull();
  });
});

describe("e2e test identities (Playwright test mode only)", () => {
  const token = (username: string, role = "driver") => {
    const payload = Buffer.from(JSON.stringify({ username, role, exp: NOW + 600 })).toString(
      "base64url"
    );
    return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
  };
  it("are refused unless the caller allows them", () => {
    expect(verifyDevSessionToken(token("e2e_driver_12345678"), SECRET, ACCOUNTS, NOW)).toBeNull();
    expect(
      verifyDevSessionToken(token("e2e_driver_12345678"), SECRET, ACCOUNTS, NOW, {
        allowTestIdentities: true,
      })
    ).toMatchObject({ username: "e2e_driver_12345678", role: "driver" });
  });
  it("must look like e2e_… and carry a real role", () => {
    const allow = { allowTestIdentities: true };
    expect(
      verifyDevSessionToken(token("dev_super_admin", "super_admin"), SECRET, ACCOUNTS, NOW, allow)
    ).toBeNull();
    expect(verifyDevSessionToken(token("e2e_x"), SECRET, ACCOUNTS, NOW, allow)).toBeNull();
    expect(
      verifyDevSessionToken(token("e2e_driver_12345678", "root"), SECRET, ACCOUNTS, NOW, allow)
    ).toBeNull();
  });
});
