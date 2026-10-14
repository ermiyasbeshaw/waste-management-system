import { randomInt } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { syncClerkUser } from "@/server/services/users";
import { closeTestPool, testPool } from "./db";

/** Gate 1b.8: Clerk → users sync (phone verification comes only from Clerk). Commits on the `test` branch. */
// The webhook has no signed-in user; React's per-request `cache` is a pass-through outside Next.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
afterAll(closeTestPool);

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await testPool().query(sql, params)).rows as T[];
const digits = (n: number) => String(randomInt(10 ** n)).padStart(n, "0");

async function hospitalUser() {
  const [f] = await q<{ id: string }>(`SELECT id FROM facilities WHERE code = 'DD-REF-001'`);
  const clerk = `user_test_${Date.now()}${digits(4)}`;
  await q(
    `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email) VALUES ($1, 'hospital_staff', $2, 'Sync Test', $3)`,
    [clerk, f.id, `${clerk}@example.test`]
  );
  return clerk;
}

const row = async (clerk: string) =>
  (
    await q<{
      email: string;
      phone_e164: string | null;
      phone_verified: boolean;
      receives_pickup_otp: boolean;
      active: boolean;
    }>(
      `SELECT email, phone_e164, phone_verified, receives_pickup_otp, active FROM users WHERE clerk_user_id = $1`,
      [clerk]
    )
  )[0];

describe("Clerk sync", () => {
  it("copies the verified phone and email; an unverified phone stops pickup codes; delete deactivates", async () => {
    const clerk = await hospitalUser();
    const phone = `+2519${digits(8)}`;
    expect(
      await syncClerkUser({
        type: "user.updated",
        clerkUserId: clerk,
        email: `${clerk}@new.example.test`,
        phoneE164: phone,
        phoneVerified: true,
      })
    ).toEqual({ result: "updated" });
    expect(await row(clerk)).toMatchObject({
      email: `${clerk}@new.example.test`,
      phone_e164: phone,
      phone_verified: true,
    });

    await q(`UPDATE users SET receives_pickup_otp = true WHERE clerk_user_id = $1`, [clerk]);
    await syncClerkUser({
      type: "user.updated",
      clerkUserId: clerk,
      email: null,
      phoneE164: phone,
      phoneVerified: false,
    });
    expect(await row(clerk)).toMatchObject({ phone_verified: false, receives_pickup_otp: false });

    const audit = await q<{ after: { phone: string } }>(
      `SELECT a.after FROM audit_logs a JOIN users u ON a.entity_id = u.id::text
       WHERE u.clerk_user_id = $1 AND a.action = 'user.clerk_synced' ORDER BY a.seq DESC LIMIT 1`,
      [clerk]
    );
    expect(audit[0].after.phone).not.toContain(phone.slice(4)); // masked in the audit log

    expect(
      await syncClerkUser({
        type: "user.deleted",
        clerkUserId: clerk,
        email: null,
        phoneE164: null,
        phoneVerified: false,
      })
    ).toEqual({ result: "deactivated" });
    expect((await row(clerk)).active).toBe(false);
  });

  it("a Clerk user without a users row is ignored (invitation only; roles come from SafeWaste)", async () => {
    expect(
      await syncClerkUser({
        type: "user.created",
        clerkUserId: `user_unknown_${Date.now()}`,
        email: "x@example.test",
        phoneE164: null,
        phoneVerified: false,
      })
    ).toEqual({ result: "unknown_user" });
  });
});
