/**
 * Assign a role to a user (CLAUDE.md §4, Gate 1b.7). Links a Clerk user (clerk_user_id) to a `users` row with a role,
 * a facility (hospital roles and disposal_operator) and the active flag. Roles live in the database, never in Clerk.
 * The change is written to the audit log (hash chain, same rules as the app's audit writer).
 *
 *   npm run user:assign -- --clerk-id user_2abc --role hospital_admin --facility DD-REF-001 \
 *        --name "Full Name" --email person@example.org [--otp-recipient] [--deactivate]
 *
 * --name and --email are required for a new user. --otp-recipient only for hospital roles with a phone verified in
 * Clerk (the database refuses it otherwise). Uses DATABASE_URL_UNPOOLED (from the environment or .env.local).
 * Prints no secrets.
 */
import { config } from "dotenv";
import { Pool } from "@neondatabase/serverless";
import { AUDIT_CHAIN_LOCK_KEY, auditHash } from "../src/server/audit/hash";

config({ path: ".env.local", quiet: true });

const ROLES = [
  "super_admin",
  "hospital_admin",
  "hospital_staff",
  "driver",
  "disposal_operator",
  "efda_officer",
] as const;
type Role = (typeof ROLES)[number];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`user:assign — ${message}`);
  process.exit(1);
}

async function main() {
  const clerkId = arg("clerk-id") ?? fail("--clerk-id is required");
  const role = (arg("role") ?? fail("--role is required")) as Role;
  if (!ROLES.includes(role)) fail(`--role must be one of ${ROLES.join(", ")}`);
  const facilityCode = arg("facility")?.toUpperCase();
  const needsFacility =
    role === "hospital_admin" || role === "hospital_staff" || role === "disposal_operator";
  if (needsFacility && !facilityCode) fail(`--facility is required for ${role}`);
  if (!needsFacility && facilityCode) fail(`${role} has no facility (CLAUDE.md §3)`);
  const otp = flag("otp-recipient");
  if (otp && role !== "hospital_admin" && role !== "hospital_staff")
    fail("--otp-recipient is for hospital roles only");

  const url = process.env.DATABASE_URL_UNPOOLED ?? fail("DATABASE_URL_UNPOOLED is not set");
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let facilityId: string | null = null;
    if (facilityCode) {
      const { rows } = await client.query(`SELECT id, type FROM facilities WHERE code = $1`, [
        facilityCode,
      ]);
      if (!rows[0]) fail(`unknown facility ${facilityCode}`);
      if (role === "disposal_operator" && rows[0].type !== "DISPOSAL_SITE")
        fail("a disposal operator belongs to the disposal site");
      if (role !== "disposal_operator" && rows[0].type === "DISPOSAL_SITE")
        fail("hospital roles belong to a health facility");
      facilityId = rows[0].id;
    }
    const existing = (
      await client.query(
        `SELECT id, role, facility_id, active, receives_pickup_otp FROM users WHERE clerk_user_id = $1 FOR UPDATE`,
        [clerkId]
      )
    ).rows[0] as
      | {
          id: string;
          role: Role | null;
          facility_id: string | null;
          active: boolean;
          receives_pickup_otp: boolean;
        }
      | undefined;
    const active = !flag("deactivate");
    let userId: string;
    if (existing) {
      await client.query(
        `UPDATE users SET role = $2, facility_id = $3, active = $4, receives_pickup_otp = $5,
                full_name = coalesce($6, full_name), email = coalesce($7, email)
         WHERE id = $1`,
        [existing.id, role, facilityId, active, otp, arg("name") ?? null, arg("email") ?? null]
      );
      userId = existing.id;
    } else {
      const name = arg("name") ?? fail("--name is required for a new user");
      const email = arg("email") ?? fail("--email is required for a new user");
      const { rows } = await client.query(
        `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email, active, receives_pickup_otp)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [clerkId, role, facilityId, name, email, active, otp]
      );
      userId = rows[0].id;
    }

    // Audit entry (role changes are always logged, CLAUDE.md §6) — same hash chain as the app's writer.
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [AUDIT_CHAIN_LOCK_KEY]);
    const last = (await client.query(`SELECT hash FROM audit_logs ORDER BY seq DESC LIMIT 1`))
      .rows[0];
    const before = existing
      ? {
          role: existing.role,
          facilityId: existing.facility_id,
          active: existing.active,
          receivesPickupOtp: existing.receives_pickup_otp,
        }
      : null;
    const after = { role, facilityId, active, receivesPickupOtp: otp };
    const row = {
      prevHash: (last?.hash as string | undefined) ?? null,
      actorUserId: null,
      role: null,
      action: existing ? "user.role_changed" : "user.role_assigned",
      entityType: "user",
      entityId: userId,
      before,
      after,
      ip: null,
      requestId: "cli:user-assign",
      createdAt: new Date(),
    };
    await client.query(
      `INSERT INTO audit_logs (prev_hash, actor_user_id, role, action, entity_type, entity_id, before, after, ip, request_id, created_at, hash)
       VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6, NULL, $7, $8, $9)`,
      [
        row.prevHash,
        row.action,
        row.entityType,
        row.entityId,
        before === null ? null : JSON.stringify(before),
        JSON.stringify(after),
        row.requestId,
        row.createdAt,
        auditHash(row),
      ]
    );
    await client.query("COMMIT");
    console.log(
      `${existing ? "Updated" : "Created"} ${clerkId}: ${role}${facilityCode ? ` at ${facilityCode}` : ""}${active ? "" : " (inactive)"}${otp ? ", receives pickup codes" : ""}.`
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    const e = err as { message?: string; constraint?: string };
    fail(
      e.constraint ? `refused by the database rule ${e.constraint}` : (e.message ?? String(err))
    );
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
