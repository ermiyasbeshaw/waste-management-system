/**
 * Operational demo data (Gate 2.9): waste in every status, trips in every state, disposal, certificates,
 * contracts and invoices — shaped like the prototype mocks, valid under CLAUDE.md §5, §6 and §9.
 *
 * - Runs ONCE: `seed.ts` calls it only when `waste_records` is empty (no hard deletes, so no re-seeding).
 * - Records are inserted in their final state (fixtures), not replayed through the Workflow Engine; every row
 *   still passes the database constraints and triggers, and `tests/integration/seed-data.test.ts` checks the
 *   cross-table invariants. Codes come from `code_sequences`, so later codes never collide.
 * - Each business record gets one audit entry (request_id "seed"), appended to the hash chain.
 * - All times are relative to "now" (EAT), so the demo always shows a trip in progress today.
 */
import { createHash, randomBytes } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import type { NeonQueryResultHKT } from "drizzle-orm/neon-serverless";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { codePeriod, containerCode, formatCode, type CodeKind } from "../src/lib/codes";
import { toEatDateString } from "../src/lib/dates";
import {
  AUDIT_CHAIN_LOCK_KEY,
  auditHash,
  toJsonValue,
  type JsonValue,
} from "../src/server/audit/hash";
import {
  auditLogs,
  certificates,
  codeSequences,
  containers,
  contracts,
  destructionMethods,
  disposalRecords,
  drivers,
  facilities,
  handovers,
  invoices,
  licenses,
  otpCodes,
  settings,
  trackerDevices,
  tripStops,
  tripStopWaste,
  trips,
  users,
  vehicles,
  wasteCategories,
  wasteRecords,
} from "../src/server/db/schema";

export type SeedTx = PgDatabase<NeonQueryResultHKT, Record<string, never>>;

type ContainerStatus = typeof containers.$inferInsert.status;
type WasteStatus = typeof wasteRecords.$inferInsert.status;

const MIN = 60_000;
const DAY = 86_400_000;

/** "now" in EAT as calendar parts, plus helpers that build instants at an EAT wall-clock time. */
function clock(now: Date) {
  const [y, m, d] = toEatDateString(now).split("-").map(Number);
  /** Instant at EAT `hh:mm` on today + `days`. */
  const at = (days: number, hh: number, mm = 0) =>
    new Date(Date.UTC(y, m - 1, d + days, hh - 3, mm));
  /** EAT calendar date (YYYY-MM-DD) of today + `days`. */
  const date = (days: number) => toEatDateString(at(days, 12));
  /** First day of the EAT month `months` from now, as YYYY-MM-DD. */
  const monthStart = (months: number) =>
    toEatDateString(new Date(Date.UTC(y, m - 1 + months, 1, 9)));
  const monthEnd = (months: number) => toEatDateString(new Date(Date.UTC(y, m + months, 0, 9)));
  return { at, date, monthStart, monthEnd, rel: (ms: number) => new Date(now.getTime() + ms) };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const randomHash = () => sha(randomBytes(32).toString("hex"));
const token = () => randomBytes(24).toString("base64url");

/** Deterministic pseudo-random numbers, so every seed run produces the same weights. */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface AuditDraft {
  actor: { id: string; role: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  after: unknown;
}

export interface OperationsSummary {
  waste: number;
  trips: number;
  certificates: number;
  contracts: number;
  invoices: number;
  audit: number;
}

export async function seedOperations(tx: SeedTx, now = new Date()): Promise<OperationsSummary> {
  const t = clock(now);
  const rand = prng(20261009);
  const audit: AuditDraft[] = [];

  // ---------- lookups ----------
  const ids = async <T extends string>(rows: { k: T; id: string }[]) =>
    new Map(rows.map((r) => [r.k, r.id]));
  const fac = await ids(
    await tx.select({ k: facilities.code, id: facilities.id }).from(facilities)
  );
  const facType = new Map(
    (await tx.select({ k: facilities.code, type: facilities.type }).from(facilities)).map((r) => [
      r.k,
      r.type,
    ])
  );
  const cat = await ids(
    await tx.select({ k: wasteCategories.code, id: wasteCategories.id }).from(wasteCategories)
  );
  const method = await ids(
    await tx
      .select({ k: destructionMethods.code, id: destructionMethods.id })
      .from(destructionMethods)
  );
  const veh = await ids(await tx.select({ k: vehicles.plateNo, id: vehicles.id }).from(vehicles));
  const userRows = await tx
    .select({
      k: users.clerkUserId,
      id: users.id,
      role: users.role,
      facilityId: users.facilityId,
      otp: users.receivesPickupOtp,
    })
    .from(users);
  const user = (clerkId: string) => {
    const u = userRows.find((r) => r.k === clerkId);
    if (!u) throw new Error(`Seed user ${clerkId} missing — run the base seed first`);
    return { id: u.id, role: u.role! };
  };
  /** The first OTP recipient of a facility (registers its waste and confirms in-app). */
  const facilityUser = (code: string) => {
    const u =
      userRows.find((r) => r.facilityId === fac.get(code) && r.otp) ??
      userRows.find((r) => r.facilityId === fac.get(code));
    if (!u) throw new Error(`No user at ${code}`);
    return { id: u.id, role: u.role! };
  };
  const driverRows = await tx.select({ id: drivers.id, userId: drivers.userId }).from(drivers);
  const driverOf = (clerkId: string) => {
    const u = user(clerkId);
    const d = driverRows.find((r) => r.userId === u.id);
    if (!d) throw new Error(`No driver profile for ${clerkId}`);
    return { driverId: d.id, user: u };
  };
  const admin = user("dev_super_admin");
  const operator = user("dev_disposal_operator");
  const D1 = driverOf("dev_driver");
  const D2 = driverOf("seed_driver_2");
  const VA = veh.get("ET-3-A48291")!;
  const VB = veh.get("ET-3-B91024")!;
  const [vatRow] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "vat_rate_percent"));
  const vatRate = Number(vatRow?.value ?? 15);
  const [dueRow] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "invoice_due_days"));
  const dueDays = Number(dueRow?.value ?? 30);

  // ---------- codes ----------
  async function reserve(kind: CodeKind, at: Date | string, count = 1): Promise<string[]> {
    const period = codePeriod(kind, at);
    const [row] = await tx
      .insert(codeSequences)
      .values({ scope: kind, period, lastValue: count })
      .onConflictDoUpdate({
        target: [codeSequences.scope, codeSequences.period],
        set: { lastValue: sql`${codeSequences.lastValue} + ${count}` },
      })
      .returning({ n: codeSequences.lastValue });
    return Array.from({ length: count }, (_, i) => formatCode(kind, period, row.n - count + 1 + i));
  }

  // ---------- waste ----------
  interface Waste {
    id: string;
    code: string;
    facility: string;
    containers: { id: string; code: string }[];
  }

  async function registerWaste(
    facility: string,
    category: string,
    count: number,
    registeredAt: Date
  ): Promise<Waste> {
    const [code] = await reserve("waste", registeredAt);
    const by = facilityUser(facility);
    const weight = (count * (2 + rand() * 8)).toFixed(2);
    const [w] = await tx
      .insert(wasteRecords)
      .values({
        wasteCode: code,
        facilityId: fac.get(facility)!,
        categoryId: cat.get(category)!,
        containerCount: count,
        weightKg: weight,
        registeredBy: by.id,
        createdAt: registeredAt,
        updatedAt: registeredAt,
      })
      .returning({ id: wasteRecords.id });
    const rows = await tx
      .insert(containers)
      .values(
        Array.from({ length: count }, (_, i) => ({
          containerCode: containerCode(code, i + 1),
          wasteRecordId: w.id,
          seqNo: i + 1,
          createdAt: registeredAt,
          updatedAt: registeredAt,
        }))
      )
      .returning({ id: containers.id, code: containers.containerCode });
    rows.sort((a, b) => a.code.localeCompare(b.code));
    audit.push({
      actor: by,
      action: "waste.registered",
      entityType: "waste_record",
      entityId: w.id,
      after: { wasteCode: code, category, containerCount: count, weightKg: weight },
    });
    return { id: w.id, code, facility, containers: rows };
  }

  const setWaste = (
    w: Waste,
    status: WasteStatus,
    extra: Partial<typeof wasteRecords.$inferInsert> = {}
  ) =>
    tx
      .update(wasteRecords)
      .set({ status, ...extra })
      .where(eq(wasteRecords.id, w.id));

  async function setContainers(
    list: { id: string }[],
    status: ContainerStatus,
    exceptionReason: string | null = null
  ) {
    for (const c of list) {
      await tx.update(containers).set({ status, exceptionReason }).where(eq(containers.id, c.id));
    }
  }

  // ---------- trips ----------
  async function createTrip(
    day: number,
    vehicleId: string,
    driver: typeof D1,
    status: typeof trips.$inferInsert.status,
    extra: Partial<typeof trips.$inferInsert> = {}
  ) {
    const plannedDate = t.date(day);
    const [code] = await reserve("trip", t.at(day, 12));
    const createdAt = t.at(day - 1, 16);
    const [row] = await tx
      .insert(trips)
      .values({
        tripCode: code,
        vehicleId,
        driverId: driver.driverId,
        plannedDate,
        status,
        createdBy: admin.id,
        createdAt,
        updatedAt: createdAt,
        ...extra,
      })
      .returning({ id: trips.id });
    audit.push({
      actor: admin,
      action: "trip.created",
      entityType: "trip",
      entityId: row.id,
      after: { tripCode: code, plannedDate, status },
    });
    return { id: row.id, code };
  }

  async function addStop(
    tripId: string,
    facility: string,
    order: number,
    values: Partial<typeof tripStops.$inferInsert> = {}
  ) {
    const [row] = await tx
      .insert(tripStops)
      .values({ tripId, facilityId: fac.get(facility)!, priorityOrder: order, ...values })
      .returning({ id: tripStops.id });
    return row.id;
  }

  const link = (stopId: string, w: Waste, active = true) =>
    tx.insert(tripStopWaste).values({ tripStopId: stopId, wasteRecordId: w.id, active });

  async function otp(
    stopId: string,
    status: typeof otpCodes.$inferInsert.status,
    issuedAt: Date,
    attempts = 0
  ) {
    const expiresAt = new Date(issuedAt.getTime() + 10 * MIN);
    const [row] = await tx
      .insert(otpCodes)
      .values({
        tripStopId: stopId,
        codeHash: randomHash(), // hash of a code nobody knows
        recipientCount: 1,
        expiresAt,
        attempts,
        status,
        verifiedAt: status === "VERIFIED" ? new Date(issuedAt.getTime() + 4 * MIN) : null,
        cancelledAt: status === "CANCELLED" ? new Date(issuedAt.getTime() + 6 * MIN) : null,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      })
      .returning({ id: otpCodes.id });
    return row.id;
  }

  async function scan(
    stopId: string,
    list: { id: string }[],
    driver: typeof D1,
    at: Date,
    otpId: string | null,
    status: "SCANNED" | "CANCELLED" = "SCANNED"
  ) {
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      await tx.insert(handovers).values({
        tripStopId: stopId,
        containerId: c.id,
        driverId: driver.driverId,
        otpId,
        scannedAt: new Date(at.getTime() + i * MIN),
        status,
      });
    }
  }

  // ---------- disposal + certificates ----------
  let certificateCount = 0;
  async function receive(w: Waste, receivedAt: Date) {
    const [d] = await tx
      .insert(disposalRecords)
      .values({
        wasteRecordId: w.id,
        operatorId: operator.id,
        receivedAt,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      })
      .returning({ id: disposalRecords.id });
    return d.id;
  }

  async function destroy(
    disposalId: string,
    destroyedAt: Date,
    methodCode = "HIGH_TEMP_INCINERATION"
  ) {
    await tx
      .update(disposalRecords)
      .set({ methodId: method.get(methodCode)!, destroyedAt, locked: true })
      .where(eq(disposalRecords.id, disposalId));
  }

  async function certificate(
    disposalId: string,
    w: Waste,
    status: "PENDING" | "ISSUED" | "FAILED" | "REVOKED",
    at: Date,
    revokedReason?: string
  ) {
    const [no] = await reserve("certificate", at);
    const issued = status === "ISSUED" || status === "REVOKED";
    const [row] = await tx
      .insert(certificates)
      .values({
        certificateNo: no,
        disposalRecordId: disposalId,
        verifyToken: token(),
        status,
        // ASSUMPTION (dev only): placeholder file key + hash until PDF generation exists (Gate 5.3).
        fileKey: issued ? `seed/certificates/${no}.pdf` : null,
        sha256: issued ? sha(`seed-certificate-${no}`) : null,
        issuedAt: issued ? at : null,
        revokedAt: status === "REVOKED" ? new Date(at.getTime() + 2 * DAY) : null,
        revokedReason: status === "REVOKED" ? revokedReason : null,
        generationAttempts: status === "PENDING" ? 0 : status === "FAILED" ? 3 : 1,
        lastError: status === "FAILED" ? "PDF renderer timed out (seed example)" : null,
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: certificates.id });
    certificateCount += 1;
    audit.push({
      actor: null, // certificate job (system)
      action: `certificate.${status.toLowerCase()}`,
      entityType: "certificate",
      entityId: row.id,
      after: { certificateNo: no, wasteCode: w.code, status },
    });
    return row.id;
  }

  /** Waste went through pickup on `day` and arrived at the site; then its disposal outcome. */
  async function atSite(
    w: Waste,
    day: number,
    outcome: "DISPOSED" | "DISPOSED_WITH_EXCEPTION" | "CLOSED_NO_DESTRUCTION" | "RECEIVED",
    cert: "PENDING" | "ISSUED" | "FAILED" | "REVOKE_REISSUE" | null
  ) {
    const receivedAt = t.at(day, 15, 30);
    const destroyedAt = t.at(day + 1, 10);
    const disposalId = await receive(w, receivedAt);
    if (outcome === "RECEIVED") {
      await setContainers(w.containers, "RECEIVED");
      await setWaste(w, "RECEIVED");
      return;
    }
    if (outcome === "CLOSED_NO_DESTRUCTION") {
      await setContainers(
        w.containers,
        "REFUSED",
        "Container leaking on arrival; refused by the site (seed example)"
      );
      await setWaste(w, "CLOSED_NO_DESTRUCTION");
      audit.push({
        actor: operator,
        action: "waste.closed_no_destruction",
        entityType: "waste_record",
        entityId: w.id,
        after: { reason: "Every container refused at the site" },
      });
      return;
    }
    if (outcome === "DISPOSED_WITH_EXCEPTION") {
      await setContainers(
        w.containers.slice(-1),
        "MISSING",
        "Not on the vehicle on arrival at the site (seed example)"
      );
      await setContainers(w.containers.slice(0, -1), "DESTROYED");
    } else {
      await setContainers(w.containers, "DESTROYED");
    }
    await destroy(disposalId, destroyedAt);
    await setWaste(w, outcome);
    audit.push({
      actor: operator,
      action: "disposal.destroyed",
      entityType: "waste_record",
      entityId: w.id,
      after: { outcome },
    });
    const certAt = new Date(destroyedAt.getTime() + 30 * MIN);
    if (cert === "REVOKE_REISSUE") {
      await certificate(
        disposalId,
        w,
        "REVOKED",
        certAt,
        "Wrong destruction method printed; reissued (seed example)"
      );
      await certificate(disposalId, w, "ISSUED", new Date(certAt.getTime() + 2 * DAY + 30 * MIN));
    } else if (cert) {
      await certificate(disposalId, w, cert, certAt);
    }
  }

  /** A completed stop: arrived, every container scanned, completed with `method`. */
  async function completedStop(
    tripId: string,
    facility: string,
    order: number,
    day: number,
    list: Waste[],
    method: "OTP" | "IN_APP" | "OVERRIDE",
    geo: { m: number | null; ok: boolean | null },
    driver: typeof D1,
    inAppOtp: "LOCKED" | "EXPIRED" = "EXPIRED"
  ) {
    const arrivedAt = t.at(day, 8, 30 + order * 50);
    const completedAt = new Date(arrivedAt.getTime() + 15 * MIN);
    const confirmedBy =
      method === "OTP"
        ? driver.user.id
        : method === "IN_APP"
          ? facilityUser(facility).id
          : admin.id;
    const stopId = await addStop(tripId, facility, order, {
      status: method === "OVERRIDE" ? "COLLECTED_OVERRIDE" : "COLLECTED",
      collectionMethod: method,
      confirmedBy,
      arrivedAt,
      completedAt,
      arrivalDistanceM: geo.m,
      geofenceOk: geo.ok,
      overrideReason:
        method === "OVERRIDE"
          ? "No recipient could receive the SMS; facility head confirmed by phone (seed example)"
          : null,
    });
    let otpId: string | null = null;
    if (method === "OTP") otpId = await otp(stopId, "VERIFIED", arrivedAt);
    if (method === "IN_APP") await otp(stopId, inAppOtp, arrivedAt, inAppOtp === "LOCKED" ? 5 : 0);
    if (method === "OVERRIDE") await otp(stopId, "CANCELLED", arrivedAt);
    for (const w of list) {
      await link(stopId, w);
      await scan(stopId, w.containers, driver, new Date(arrivedAt.getTime() + 2 * MIN), otpId);
      await setContainers(w.containers, "COLLECTED");
      await setWaste(w, "IN_TRANSIT");
    }
    audit.push({
      actor:
        method === "IN_APP" ? facilityUser(facility) : method === "OVERRIDE" ? admin : driver.user,
      action: method === "OVERRIDE" ? "stop.override" : "stop.collected",
      entityType: "trip_stop",
      entityId: stopId,
      after: { method, containers: list.reduce((n, w) => n + w.containers.length, 0) },
    });
    return stopId;
  }

  async function completedTrip(day: number, vehicleId: string, driver: typeof D1) {
    return createTrip(day, vehicleId, driver, "COMPLETED", {
      startedAt: t.at(day, 8),
      completedAt: t.at(day, 16),
    });
  }

  // ---------- fleet extras ----------
  await tx.insert(licenses).values([
    {
      subjectType: "VEHICLE",
      subjectId: VA,
      kind: "Hazardous waste transport permit",
      number: "EFDA-HWT-2291",
      issuedOn: t.date(-65),
      expiresOn: t.date(300),
    },
    {
      subjectType: "VEHICLE",
      subjectId: VB,
      kind: "Hazardous waste transport permit",
      number: "EFDA-HWT-2307",
      issuedOn: t.date(-347),
      expiresOn: t.date(18),
    },
    {
      subjectType: "DRIVER",
      subjectId: D1.driverId,
      kind: "Driving licence (grade 4)",
      number: "ETH-DD-DRV-9018",
      issuedOn: t.date(-900),
      expiresOn: t.date(500),
    },
    {
      subjectType: "DRIVER",
      subjectId: D2.driverId,
      kind: "Driving licence (grade 4)",
      number: "ETH-DD-DRV-9022",
      issuedOn: t.date(-500),
      expiresOn: t.date(200),
    },
    {
      subjectType: "SITE",
      subjectId: fac.get("DD-DIS-018")!,
      kind: "Hazardous waste treatment permit",
      number: "EPA-DD-HWTP-0007",
      issuedOn: t.date(-300),
      expiresOn: t.date(400),
    },
  ]);
  await tx.insert(trackerDevices).values([
    { deviceId: "TRK-A48291", vehicleId: VA, tokenHash: randomHash() },
    { deviceId: "TRK-B91024", vehicleId: VB, tokenHash: randomHash() },
  ]);

  // ---------- history: completed trips for charts (disposed + certificates) ----------
  const historyPlan: [number, string, string][][] = [
    [
      [-42, "DD-REF-001", "INFECTIOUS"],
      [-42, "DD-GEN-003", "SHARPS"],
      [-42, "DD-PRI-006", "PATHOLOGICAL"],
    ],
    [
      [-35, "DD-GEN-002", "INFECTIOUS"],
      [-35, "DD-PHA-012", "PHARMACEUTICAL"],
      [-35, "DD-CLI-016", "SHARPS"],
    ],
    [
      [-28, "DD-REF-001", "PATHOLOGICAL"],
      [-28, "DD-PRI-005", "INFECTIOUS"],
      [-28, "DD-PHA-015", "CHEMICAL"],
    ],
  ];
  let wasteCount = 0;
  let tripCount = 0;
  for (let i = 0; i < historyPlan.length; i++) {
    const plan = historyPlan[i];
    const day = plan[0][0];
    const driver = i % 2 ? D2 : D1;
    const trip = await completedTrip(day, i % 2 ? VB : VA, driver);
    tripCount++;
    for (let order = 0; order < plan.length; order++) {
      const [, facility, category] = plan[order];
      const w = await registerWaste(
        facility,
        category,
        1 + Math.floor(rand() * 4),
        t.at(day - 3, 9 + order)
      );
      wasteCount++;
      await completedStop(
        trip.id,
        facility,
        order + 1,
        day,
        [w],
        "OTP",
        { m: 20 + Math.floor(rand() * 200), ok: true },
        driver
      );
      await atSite(w, day, "DISPOSED", "ISSUED");
    }
  }

  // ---------- T1 (-21): OTP, OTP, in-app (OTP locked); one certificate revoked + reissued ----------
  {
    const day = -21;
    const trip = await completedTrip(day, VA, D1);
    const w1 = await registerWaste("DD-REF-001", "INFECTIOUS", 4, t.at(day - 2, 10));
    const w2 = await registerWaste("DD-GEN-003", "SHARPS", 2, t.at(day - 2, 11));
    const w3 = await registerWaste("DD-PHA-010", "PHARMACEUTICAL", 3, t.at(day - 1, 9));
    await completedStop(trip.id, "DD-REF-001", 1, day, [w1], "OTP", { m: 35, ok: true }, D1);
    await completedStop(trip.id, "DD-GEN-003", 2, day, [w2], "OTP", { m: 120, ok: true }, D1);
    await completedStop(
      trip.id,
      "DD-PHA-010",
      3,
      day,
      [w3],
      "IN_APP",
      { m: 60, ok: true },
      D1,
      "LOCKED"
    );
    await atSite(w1, day, "DISPOSED", "ISSUED");
    await atSite(w2, day, "DISPOSED", "ISSUED");
    await atSite(w3, day, "DISPOSED", "REVOKE_REISSUE");
    tripCount++;
    wasteCount += 3;
  }

  // ---------- T2 (-14): OTP, override (outside geofence), skipped stop (scan cancelled) ----------
  let skippedWaste: Waste;
  {
    const day = -14;
    const trip = await completedTrip(day, VB, D2);
    const w4 = await registerWaste("DD-GEN-002", "INFECTIOUS", 3, t.at(day - 2, 10));
    const w5 = await registerWaste("DD-PRI-005", "PATHOLOGICAL", 2, t.at(day - 1, 14));
    skippedWaste = await registerWaste("DD-CLI-008", "GENERAL", 2, t.at(day - 2, 15));
    await completedStop(trip.id, "DD-GEN-002", 1, day, [w4], "OTP", { m: 42, ok: true }, D2);
    await completedStop(trip.id, "DD-PRI-005", 2, day, [w5], "OVERRIDE", { m: 880, ok: false }, D2);
    const arrivedAt = t.at(day, 11, 10);
    const stop3 = await addStop(trip.id, "DD-CLI-008", 3, {
      status: "SKIPPED",
      arrivedAt,
      arrivalDistanceM: 75,
      geofenceOk: true,
      skipReason: "Store room locked; facility asked to come back another day (seed example)",
    });
    await link(stop3, skippedWaste, false);
    await otp(stop3, "CANCELLED", arrivedAt);
    await scan(
      stop3,
      skippedWaste.containers.slice(0, 1),
      D2,
      new Date(arrivedAt.getTime() + 2 * MIN),
      null,
      "CANCELLED"
    );
    audit.push({
      actor: D2.user,
      action: "stop.skipped",
      entityType: "trip_stop",
      entityId: stop3,
      after: { reason: "Store room locked" },
    });
    await atSite(w4, day, "DISPOSED_WITH_EXCEPTION", "ISSUED");
    await atSite(w5, day, "DISPOSED", "PENDING");
    tripCount++;
    wasteCount += 3;
  }

  // ---------- T3 (-7): no GPS, OTP, in-app (OTP expired); closed without destruction; failed certificate; awaiting destruction ----------
  {
    const day = -7;
    const trip = await completedTrip(day, VA, D1);
    const w7 = await registerWaste("DD-GEN-004", "CHEMICAL", 2, t.at(day - 2, 9));
    const w8 = await registerWaste("DD-CLI-013", "SHARPS", 1, t.at(day - 1, 10));
    const w9 = await registerWaste("DD-PHA-011", "PHARMACEUTICAL", 2, t.at(day - 1, 13));
    await completedStop(trip.id, "DD-GEN-004", 1, day, [w7], "OTP", { m: null, ok: null }, D1);
    await completedStop(trip.id, "DD-CLI-013", 2, day, [w8], "OTP", { m: 150, ok: true }, D1);
    await completedStop(trip.id, "DD-PHA-011", 3, day, [w9], "IN_APP", { m: 30, ok: true }, D1);
    await atSite(w7, day, "CLOSED_NO_DESTRUCTION", null);
    await atSite(w8, day, "DISPOSED", "FAILED");
    // Received at the site, waiting for the incinerator.
    await atSite(w9, day, "RECEIVED", null);
    tripCount++;
    wasteCount += 3;
  }

  // ---------- T4 (-3): cancelled before departure; its waste is back on the waiting list ----------
  let cancelledTripWaste: Waste;
  {
    const day = -3;
    cancelledTripWaste = await registerWaste("DD-CLI-014", "GENERAL", 1, t.at(-5, 10));
    const trip = await createTrip(day, VB, D2, "CANCELLED", {
      cancelReason: "Vehicle breakdown before departure (seed example)",
      cancelledAt: t.at(day, 7, 30),
    });
    const stop = await addStop(trip.id, "DD-CLI-014", 1, {
      status: "SKIPPED",
      skipReason: "Trip cancelled: vehicle breakdown (seed example)",
    });
    await link(stop, cancelledTripWaste, false);
    audit.push({
      actor: admin,
      action: "trip.cancelled",
      entityType: "trip",
      entityId: trip.id,
      after: { reason: "Vehicle breakdown before departure" },
    });
    tripCount++;
    wasteCount++;
  }

  // ---------- T5 (today): in progress — collected, truck at the door of DD-REF-001, pending ----------
  {
    const trip = await createTrip(0, VA, D1, "IN_PROGRESS", { startedAt: t.rel(-3 * 60 * MIN) });
    const w11 = await registerWaste("DD-CLI-016", "INFECTIOUS", 2, t.at(-2, 10));
    const w12 = await registerWaste("DD-REF-001", "SHARPS", 2, t.at(-1, 9));
    const w13 = await registerWaste("DD-REF-001", "INFECTIOUS", 3, t.at(-1, 15));
    const w14 = await registerWaste("DD-GEN-002", "PHARMACEUTICAL", 1, t.at(-2, 11));
    // Stop 1: collected by OTP two hours ago.
    const a1 = t.rel(-2 * 60 * MIN);
    const s1 = await addStop(trip.id, "DD-CLI-016", 1, {
      status: "COLLECTED",
      collectionMethod: "OTP",
      confirmedBy: D1.user.id,
      arrivedAt: a1,
      completedAt: new Date(a1.getTime() + 15 * MIN),
      arrivalDistanceM: 55,
      geofenceOk: true,
    });
    const o1 = await otp(s1, "VERIFIED", a1);
    await link(s1, w11);
    await scan(s1, w11.containers, D1, new Date(a1.getTime() + 2 * MIN), o1);
    await setContainers(w11.containers, "COLLECTED");
    await setWaste(w11, "IN_TRANSIT");
    // Stop 2: arrived 5 minutes ago; OTP issued; 1 of 5 containers scanned so far.
    const a2 = t.rel(-5 * MIN);
    const s2 = await addStop(trip.id, "DD-REF-001", 2, {
      status: "ARRIVED",
      arrivedAt: a2,
      arrivalDistanceM: 48,
      geofenceOk: true,
    });
    await otp(s2, "ISSUED", a2);
    for (const w of [w12, w13]) {
      await link(s2, w);
      await setWaste(w, "SCHEDULED");
    }
    await scan(s2, w12.containers.slice(0, 1), D1, new Date(a2.getTime() + MIN), null);
    await setContainers(w12.containers.slice(0, 1), "SCANNED_AT_PICKUP");
    // Stop 3: still to visit.
    const s3 = await addStop(trip.id, "DD-GEN-002", 3);
    await link(s3, w14);
    await setWaste(w14, "SCHEDULED");
    await tx.update(drivers).set({ status: "ON_TRIP" }).where(eq(drivers.id, D1.driverId));
    await tx.update(vehicles).set({ status: "IN_TRANSIT" }).where(eq(vehicles.id, VA));
    await tx.update(drivers).set({ status: "ON_DUTY" }).where(eq(drivers.id, D2.driverId));
    tripCount++;
    wasteCount += 4;
  }

  // ---------- T6 (tomorrow): planned ----------
  {
    const trip = await createTrip(1, VB, D2, "PLANNED");
    const w15 = await registerWaste("DD-PRI-006", "INFECTIOUS", 2, t.at(-1, 10));
    const w16 = await registerWaste("DD-PHA-015", "CHEMICAL", 1, t.at(-1, 12));
    const s1 = await addStop(trip.id, "DD-PRI-006", 1);
    const s2 = await addStop(trip.id, "DD-PHA-015", 2);
    await link(s1, w15);
    await link(s2, w16);
    await setWaste(w15, "SCHEDULED");
    await setWaste(w16, "SCHEDULED");
    tripCount++;
    wasteCount += 2;
  }

  // ---------- waiting list (REGISTERED) + one cancelled registration ----------
  await registerWaste("DD-PRI-007", "INFECTIOUS", 2, t.at(-2, 9));
  await registerWaste("DD-PHA-012", "SHARPS", 1, t.at(-1, 14));
  await registerWaste("DD-CLI-017", "GENERAL", 1, t.at(-9, 10)); // overdue AND facility not ready
  await registerWaste("DD-GEN-003", "INFECTIOUS", 3, t.rel(-90 * MIN));
  const dup = await registerWaste("DD-GEN-002", "SHARPS", 1, t.at(-4, 11));
  await setWaste(dup, "CANCELLED", {
    cancelReason: "Registered twice by mistake (seed example)",
    cancelledAt: t.at(-4, 11, 20),
    cancelledBy: facilityUser("DD-GEN-002").id,
  });
  audit.push({
    actor: facilityUser("DD-GEN-002"),
    action: "waste.cancelled",
    entityType: "waste_record",
    entityId: dup.id,
    after: { reason: "Registered twice by mistake" },
  });
  void skippedWaste;
  void cancelledTripWaste;
  wasteCount += 5;

  // ---------- contracts + invoices ----------
  const FEES: Record<string, number> = {
    REFERRAL_HOSPITAL: 2_500_000,
    GENERAL_HOSPITAL: 1_500_000,
    PRIMARY_HOSPITAL: 800_000,
    CLINIC: 450_000,
    PHARMACY: 300_000,
  };
  const warnDays = 30;
  const statusFor = (end: string) => {
    const today = t.date(0);
    if (end <= today) return "EXPIRED" as const;
    const left = (Date.parse(end) - Date.parse(today)) / DAY;
    return left <= warnDays ? ("EXPIRING_SOON" as const) : ("ACTIVE" as const);
  };
  const addYears = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;
  let contractCount = 0;
  let invoiceCount = 0;
  const healthCodes = Array.from(fac.keys())
    .filter((c) => facType.get(c) !== "DISPOSAL_SITE" && c !== "DD-CLI-009")
    .sort();
  for (let i = 0; i < healthCodes.length; i++) {
    const code = healthCodes[i];
    const expiringSoon = code === "DD-GEN-004" || code === "DD-PRI-007";
    const end = expiringSoon ? t.date(20 + i) : addYears(t.monthStart(-9), 2);
    const start = expiringSoon ? addYears(end, -1) : t.monthStart(-9);
    const fee = FEES[facType.get(code)!];
    if (code === "DD-REF-001") {
      // An earlier contract that has ended (no overlap: it ends the day the current one starts).
      const [old] = await reserve("contract", addYears(start, -1));
      await tx.insert(contracts).values({
        contractCode: old,
        facilityId: fac.get(code)!,
        startDate: addYears(start, -1),
        endDate: start,
        monthlyFeeSantim: 2_200_000,
        status: "EXPIRED",
      });
      contractCount++;
    }
    const [contractCode] = await reserve("contract", start);
    const [ct] = await tx
      .insert(contracts)
      .values({
        contractCode,
        facilityId: fac.get(code)!,
        startDate: start,
        endDate: end,
        monthlyFeeSantim: fee,
        status: statusFor(end),
        terms: "Monthly collection and destruction service (seed example)",
      })
      .returning({ id: contracts.id });
    contractCount++;
    audit.push({
      actor: admin,
      action: "contract.created",
      entityType: "contract",
      entityId: ct.id,
      after: { contractCode, monthlyFeeSantim: fee },
    });

    for (const back of [3, 2, 1]) {
      const periodStart = t.monthStart(-back);
      if (periodStart < start) continue;
      const [invoiceNo] = await reserve("invoice", periodStart);
      const vat = Math.round((fee * vatRate) / 100);
      const issuedAt = new Date(Date.parse(`${t.monthStart(-back + 1)}T06:00:00Z`));
      const due = toEatDateString(new Date(issuedAt.getTime() + dueDays * DAY));
      const settled = back === 3 || (back === 2 && i % 2 === 0);
      const cancelled = back === 1 && code === "DD-CLI-016";
      const base = {
        invoiceNo,
        contractId: ct.id,
        facilityId: fac.get(code)!,
        periodStart,
        periodEnd: t.monthEnd(-back),
        subtotalSantim: fee,
        vatRatePercent: String(vatRate),
        vatSantim: vat,
        totalSantim: fee + vat,
      };
      const values: typeof invoices.$inferInsert =
        back === 1
          ? cancelled
            ? {
                ...base,
                status: "CANCELLED",
                cancelledAt: issuedAt,
                cancelReason: "Facility closed for renovation this month (seed example)",
              }
            : { ...base, status: "DRAFT" }
          : settled
            ? {
                ...base,
                status: "SETTLED_OFFLINE",
                issuedAt,
                dueDate: due,
                settledAt: new Date(issuedAt.getTime() + 12 * DAY),
                settlementRef: `BANK-${invoiceNo.slice(4)}`,
              }
            : { ...base, status: "ISSUED", issuedAt, dueDate: due };
      const [inv] = await tx.insert(invoices).values(values).returning({ id: invoices.id });
      invoiceCount++;
      audit.push({
        actor: admin,
        action: `invoice.${values.status!.toLowerCase()}`,
        entityType: "invoice",
        entityId: inv.id,
        after: { invoiceNo, totalSantim: fee + vat },
      });
    }
  }

  // ---------- audit chain ----------
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`);
  const [last] = await tx
    .select({ hash: auditLogs.hash })
    .from(auditLogs)
    .orderBy(desc(auditLogs.seq))
    .limit(1);
  let prevHash: string | null = last?.hash ?? null;
  const rows = audit.map((a, i) => {
    const row = {
      prevHash,
      actorUserId: a.actor?.id ?? null,
      role: a.actor?.role ?? null,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      before: null as JsonValue,
      after: toJsonValue(a.after),
      ip: null,
      requestId: "seed",
      createdAt: new Date(now.getTime() + i), // distinct, ordered
    };
    const hash = auditHash(row);
    prevHash = hash;
    return {
      ...row,
      role: row.role as typeof auditLogs.$inferInsert.role,
      before: sql`NULL`,
      hash,
    };
  });
  for (let i = 0; i < rows.length; i += 50) {
    await tx.insert(auditLogs).values(rows.slice(i, i + 50));
  }

  return {
    waste: wasteCount,
    trips: tripCount,
    certificates: certificateCount,
    contracts: contractCount,
    invoices: invoiceCount,
    audit: rows.length,
  };
}
