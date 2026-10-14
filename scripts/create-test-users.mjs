#!/usr/bin/env node
/**
 * Creates the six SafeWaste TEST users in the Clerk Development app (username + password), then writes the
 * result — username, email, role, route (area) and Clerk user id — into docs/test-users.md.
 *
 * Run it yourself:   npm run users:create-test
 * Options:           --with-phone   also add Clerk test phone numbers (+1 555 555 01xx, code 424242)
 *
 * - Reads CLERK_SECRET_KEY from .env.local and the shared test password from docs/test-users.md
 *   ("Test password: …"). Neither value is printed.
 * - Safe to run twice: a user whose email already exists is not created again (its id is reused).
 * - Refuses to run against a production Clerk key (sk_live_…).
 * - Roles are NOT stored in Clerk. The "role" and "route" here are for linking each Clerk user to the
 *   `users` table (CLAUDE.md §4); the app reads the role from the database, never from Clerk.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const MD_PATH = resolve(ROOT, "docs/test-users.md");
const WITH_PHONE = process.argv.includes("--with-phone");

/** Role → the area (route) a signed-in user of that role opens (CLAUDE.md §3). */
const ROUTE_BY_ROLE = {
  super_admin: "/admin",
  hospital_admin: "/hospital",
  hospital_staff: "/hospital",
  driver: "/driver",
  disposal_operator: "/disposal",
  efda_officer: "/regulator",
};

/** The six test users (fictional names, same as the prototype's mock data). */
const TEST_USERS = [
  { username: "sw_admin", first: "Test", last: "Admin", email: "admin+clerk_test@example.com", phone: "+15555550101", role: "super_admin", facility: null },
  { username: "sw_hospital_admin", first: "Aster", last: "Tadesse", email: "hospital.admin+clerk_test@example.com", phone: "+15555550102", role: "hospital_admin", facility: "DD-REF-001" },
  { username: "sw_hospital_staff", first: "Genet", last: "Alemu", email: "hospital.staff+clerk_test@example.com", phone: "+15555550103", role: "hospital_staff", facility: "DD-GEN-002" },
  { username: "sw_driver", first: "Abebe", last: "Kebede", email: "driver+clerk_test@example.com", phone: "+15555550104", role: "driver", facility: null },
  { username: "sw_disposal", first: "Kassahun", last: "Worku", email: "disposal+clerk_test@example.com", phone: "+15555550105", role: "disposal_operator", facility: "DD-DIS-018" },
  { username: "sw_efda", first: "Tariku", last: "Haile", email: "efda+clerk_test@example.com", phone: "+15555550106", role: "efda_officer", facility: null },
];

function readEnvLocal() {
  const text = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
  );
}

function readTestPassword() {
  const match = readFileSync(MD_PATH, "utf8").match(/Test password:\s*([^\s`]+)/);
  if (!match) throw new Error('No "Test password: …" line found in docs/test-users.md');
  return match[1];
}

async function clerk(secret, method, path, body) {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = (data.errors ?? []).map((e) => `${e.code}: ${e.long_message ?? e.message}`).join("; ");
    const err = new Error(`HTTP ${res.status} ${errors || res.statusText}`);
    err.status = res.status;
    err.codes = (data.errors ?? []).map((e) => e.code);
    throw err;
  }
  return data;
}

function hint(err) {
  const codes = err.codes ?? [];
  if (codes.some((c) => c.includes("username"))) {
    return "Turn on Username in Clerk: Configure → User & authentication → Username.";
  }
  if (codes.some((c) => c.includes("password"))) {
    return "Turn on Password in Clerk: Configure → User & authentication → Password.";
  }
  if (codes.some((c) => c.includes("phone"))) {
    return "Phone numbers are not enabled on this Clerk app; run again without --with-phone.";
  }
  return "";
}

async function main() {
  const env = readEnvLocal();
  const secret = env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is missing in .env.local");
  if (!secret.startsWith("sk_test_")) {
    throw new Error("Refusing to create test users with a non-test Clerk key (expected sk_test_…).");
  }
  const password = readTestPassword();

  const results = [];
  for (const u of TEST_USERS) {
    const found = await clerk(secret, "GET", `/users?email_address=${encodeURIComponent(u.email)}`);
    if (Array.isArray(found) && found.length > 0) {
      results.push({ ...u, clerkId: found[0].id, status: "already existed" });
      console.log(`= ${u.username.padEnd(18)} already exists (${found[0].id})`);
      continue;
    }
    try {
      const created = await clerk(secret, "POST", "/users", {
        email_address: [u.email],
        ...(WITH_PHONE ? { phone_number: [u.phone] } : {}),
        username: u.username,
        password,
        first_name: u.first,
        last_name: u.last,
      });
      results.push({ ...u, clerkId: created.id, status: "created" });
      console.log(`+ ${u.username.padEnd(18)} created (${created.id})`);
    } catch (err) {
      results.push({ ...u, clerkId: null, status: `FAILED: ${err.message}` });
      console.log(`! ${u.username.padEnd(18)} failed: ${err.message}`);
      const h = hint(err);
      if (h) console.log(`  → ${h}`);
    }
  }

  writeMarkdown(results);
  const ok = results.filter((r) => r.clerkId).length;
  console.log(`\n${ok}/${results.length} test users exist in Clerk. Details saved in docs/test-users.md.`);
  if (ok < results.length) process.exitCode = 1;
}

function writeMarkdown(results) {
  const START = "<!-- created-users:start -->";
  const END = "<!-- created-users:end -->";
  const rows = results
    .map(
      (r) =>
        `| ${r.first} ${r.last} | \`${r.username}\` | \`${r.email}\` | ${WITH_PHONE ? r.phone : "—"} | ${r.role} | ${
          r.facility ?? "—"
        } | \`${ROUTE_BY_ROLE[r.role]}\` | ${r.clerkId ? `\`${r.clerkId}\`` : "—"} | ${r.status} |`
    )
    .join("\n");
  const section = `${START}
## Created test users (written by \`npm run users:create-test\`, ${new Date().toISOString().slice(0, 16)}Z)

Sign in at http://localhost:3000/sign-in with the **username** (or email) and the **Test password** above.
After sign-in, \`/\` sends each user to the route of their role — once the role is in the \`users\` table.
Link each Clerk user id below to a \`users\` row (role + facility); the app never reads roles from Clerk.

| Name | Username | Email | Phone | Role | Facility | Route | Clerk user id | Status |
|---|---|---|---|---|---|---|---|---|
${rows}
${END}`;

  let md = readFileSync(MD_PATH, "utf8");
  const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
  md = pattern.test(md) ? md.replace(pattern, section) : `${md.trimEnd()}\n\n${section}\n`;
  writeFileSync(MD_PATH, md);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
