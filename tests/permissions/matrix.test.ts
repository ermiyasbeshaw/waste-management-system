import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
// Services (vi.mock calls below are hoisted above these imports)
import { checkAuditChain } from "@/server/services/audit-check";
import * as billing from "@/server/services/billing";
import * as certificates from "@/server/services/certificates";
import * as disposal from "@/server/services/disposal";
import { exportReport } from "@/server/services/exports";
import * as facilities from "@/server/services/facilities";
import * as fleet from "@/server/services/fleet";
import { getContainerLabelsPdf } from "@/server/services/labels";
import { getTripManifestPdf } from "@/server/services/manifest";
import * as pickup from "@/server/services/pickup";
import * as scheduling from "@/server/services/scheduling";
import { updateSettingValue } from "@/server/services/settings-admin";
import * as waste from "@/server/services/waste";
import * as medicine from "@/server/services/medicine";
// Queries
import * as adminQ from "@/server/queries/admin";
import * as disposalQ from "@/server/queries/disposal";
import * as driverQ from "@/server/queries/driver";
import * as hospitalQ from "@/server/queries/hospital";
import * as medicineQ from "@/server/queries/medicine";
import * as regulatorQ from "@/server/queries/regulator";
import * as trackingQ from "@/server/queries/tracking";
import { closeTestPool, testPool } from "../integration/db";

/**
 * Gate 7.1: the permission matrix (architecture Appendix C, as narrowed by CLAUDE.md §3) — every role × every
 * service and query. A denied role must get 403 FORBIDDEN. An allowed role must get past the role check: the calls
 * use deliberately invalid input or unknown IDs, so they end in 404 / 409 / 422 (or a read) and NEVER change data.
 * efda_officer gets 403 from every write (CLAUDE.md §3).
 *
 * Where Appendix C allows more than CLAUDE.md, CLAUDE.md is applied and the difference is an OPEN QUESTION
 * (docs/changes/gate-7.md): driver route replay of own trips, disposal operator certificate download and exports,
 * EFDA officer read of contracts and invoices.
 */
let session: ActiveUser | null = null;
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!session || !roles.includes(session.role)) throw new AppError("FORBIDDEN", 403);
    return session;
  }),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

const ROLES: Role[] = [
  "super_admin",
  "hospital_admin",
  "hospital_staff",
  "driver",
  "disposal_operator",
  "efda_officer",
];
const SA: Role[] = ["super_admin"];
const HOSP: Role[] = ["hospital_admin", "hospital_staff"];
const NOBODY = "00000000-0000-7000-8000-000000000001";
const meta = () => ({ requestId: "matrix", idempotencyKey: randomUUID() });

const users = {} as Record<Role, ActiveUser>;
beforeAll(async () => {
  const rows = (
    await testPool().query(
      `SELECT id, role, facility_id FROM users WHERE clerk_user_id = ANY($1::text[])`,
      [ROLES.map((r) => `dev_${r}`)]
    )
  ).rows as { id: string; role: Role; facility_id: string | null }[];
  for (const r of rows)
    users[r.role] = { id: r.id, role: r.role, facilityId: r.facility_id, active: true };
});
afterAll(closeTestPool);

type Entry = {
  /** Appendix C capability (or CLAUDE.md §3 line) this call belongs to. */
  capability: string;
  name: string;
  allowed: Role[];
  call: () => Promise<unknown>;
  /** Writes are refused for efda_officer even when Appendix C says R. */
  write?: boolean;
  /** Only the refusals are tested (the allowed call would do real work, e.g. run a job). */
  denyOnly?: boolean;
  /** The one write efda_officer may do (CLAUDE.md §3 / §12: decide medicine disposal requests). */
  efdaWrite?: boolean;
};

const MATRIX: Entry[] = [
  // Register / cancel waste, label containers — HS W(own), HA W(own), SA W, EF R
  {
    capability: "waste",
    name: "registerWaste",
    allowed: HOSP,
    write: true,
    call: () => waste.registerWaste({}, { idempotencyKey: null }),
  },
  {
    capability: "waste",
    name: "cancelWaste",
    allowed: [...HOSP, "super_admin"],
    write: true,
    call: () => waste.cancelWaste(NOBODY, {}),
  },
  {
    capability: "waste",
    name: "getContainerLabelsPdf",
    allowed: [...HOSP, "super_admin"],
    write: true,
    call: () => getContainerLabelsPdf(NOBODY),
  },
  // Manage own facility users and OTP recipients — HA W(own), SA W
  {
    capability: "own users",
    name: "updateHospitalUser",
    allowed: ["hospital_admin"],
    write: true,
    call: () => facilities.updateHospitalUser(NOBODY, {}),
  },
  // Manage facilities, users, fleet, trackers, settings — SA W
  {
    capability: "admin",
    name: "createFacility",
    allowed: SA,
    write: true,
    call: () => facilities.createFacility({}),
  },
  {
    capability: "admin",
    name: "updateFacility",
    allowed: SA,
    write: true,
    call: () => facilities.updateFacility("XX-NOP-000", {}),
  },
  {
    capability: "admin",
    name: "setFacilityStatus",
    allowed: SA,
    write: true,
    call: () => facilities.setFacilityStatus("XX-NOP-000", {}),
  },
  {
    capability: "admin",
    name: "updateUserAccess",
    allowed: SA,
    write: true,
    call: () => facilities.updateUserAccess(NOBODY, {}),
  },
  {
    capability: "admin",
    name: "createVehicle",
    allowed: SA,
    write: true,
    call: () => fleet.createVehicle({}),
  },
  {
    capability: "admin",
    name: "updateVehicle",
    allowed: SA,
    write: true,
    call: () => fleet.updateVehicle(NOBODY, {}),
  },
  {
    capability: "admin",
    name: "setVehicleStatus",
    allowed: SA,
    write: true,
    call: () => fleet.setVehicleStatus(NOBODY, {}),
  },
  {
    capability: "admin",
    name: "createDriverProfile",
    allowed: SA,
    write: true,
    call: () => fleet.createDriverProfile({}),
  },
  {
    capability: "admin",
    name: "createTracker",
    allowed: SA,
    write: true,
    call: () => fleet.createTracker({}),
  },
  {
    capability: "admin",
    name: "rotateTrackerToken",
    allowed: SA,
    write: true,
    call: () => fleet.rotateTrackerToken(NOBODY),
  },
  {
    capability: "admin",
    name: "setTrackerActive",
    allowed: SA,
    write: true,
    call: () => fleet.setTrackerActive(NOBODY, false),
  },
  {
    capability: "admin",
    name: "addLicence",
    allowed: SA,
    write: true,
    call: () => fleet.addLicence({}),
  },
  {
    capability: "admin",
    name: "updateSettingValue",
    allowed: SA,
    write: true,
    call: () => updateSettingValue("otp_expiry_minutes", -1),
  },
  // Create / change / cancel trips — SA W, DR R(own), EF R
  {
    capability: "trips",
    name: "createTrip",
    allowed: SA,
    write: true,
    call: () => scheduling.createTrip({}),
  },
  {
    capability: "trips",
    name: "cancelTrip",
    allowed: SA,
    write: true,
    call: () => scheduling.cancelTrip(NOBODY, { reason: "" }, meta()),
  },
  {
    capability: "trips",
    name: "reassignTrip",
    allowed: SA,
    write: true,
    call: () => scheduling.reassignTrip(NOBODY, {}, meta()),
  },
  {
    capability: "trips",
    name: "getTripManifestPdf",
    allowed: ["super_admin", "driver"],
    call: () => getTripManifestPdf(NOBODY),
  },
  // Confirm handover in-app — HS W(own), HA W(own)
  {
    capability: "handover in-app",
    name: "confirmHandover",
    allowed: HOSP,
    write: true,
    call: () => pickup.confirmHandover(NOBODY, meta()),
  },
  // Arrive, scan, verify OTP, skip stop — DR W(own) (skip also SA, CLAUDE.md §5)
  {
    capability: "driver",
    name: "startTrip",
    allowed: ["driver"],
    write: true,
    call: () => pickup.startTrip(NOBODY, meta()),
  },
  {
    capability: "driver",
    name: "arriveAtStop",
    allowed: ["driver"],
    write: true,
    call: () => pickup.arriveAtStop(NOBODY, meta()),
  },
  {
    capability: "driver",
    name: "scanContainer",
    allowed: ["driver"],
    write: true,
    call: () => pickup.scanContainer(NOBODY, {}, meta()),
  },
  {
    capability: "driver",
    name: "verifyOtp",
    allowed: ["driver"],
    write: true,
    call: () => pickup.verifyOtp(NOBODY, {}, meta()),
  },
  {
    capability: "driver",
    name: "resendOtp",
    allowed: ["driver"],
    write: true,
    call: () => pickup.resendOtp(NOBODY, meta()),
  },
  {
    capability: "driver",
    name: "skipStop",
    allowed: ["driver", "super_admin"],
    write: true,
    call: () => pickup.skipStop(NOBODY, {}, meta()),
  },
  // Override pickup without OTP — SA W, EF R
  {
    capability: "override",
    name: "overrideStop",
    allowed: SA,
    write: true,
    call: () => pickup.overrideStop(NOBODY, {}, meta()),
  },
  // Live map and route replay — SA R, EF R (Appendix C also DR R(own): open question)
  {
    capability: "map",
    name: "getLiveMap",
    allowed: ["super_admin", "efda_officer"],
    call: () => trackingQ.getLiveMap(),
  },
  {
    capability: "map",
    name: "getReplayableTrips",
    allowed: ["super_admin", "efda_officer"],
    call: () => trackingQ.getReplayableTrips(),
  },
  {
    capability: "map",
    name: "getTripReplay",
    allowed: ["super_admin", "efda_officer"],
    call: () => trackingQ.getTripReplay(NOBODY),
  },
  // Receive containers, exceptions, destruction — DO W, SA R, EF R
  {
    capability: "disposal",
    name: "receiveContainer",
    allowed: ["disposal_operator"],
    write: true,
    call: () => disposal.receiveContainer({}, meta()),
  },
  {
    capability: "disposal",
    name: "recordContainerException",
    allowed: ["disposal_operator"],
    write: true,
    call: () => disposal.recordContainerException({}, meta()),
  },
  {
    capability: "disposal",
    name: "destroyWaste",
    allowed: ["disposal_operator"],
    write: true,
    call: () => disposal.destroyWaste(NOBODY, {}, meta()),
  },
  {
    capability: "disposal",
    name: "closeWithoutDestruction",
    allowed: ["disposal_operator"],
    write: true,
    call: () => disposal.closeWithoutDestruction(NOBODY, {}, meta()),
  },
  // View / download certificates — HS R(own), HA R(own), SA R, EF R (Appendix C also DO R: open question)
  {
    capability: "certificates",
    name: "downloadCertificate",
    allowed: ["super_admin", "efda_officer", ...HOSP],
    call: () => certificates.downloadCertificate(NOBODY),
  },
  // Revoke certificate — SA W
  {
    capability: "revoke",
    name: "revokeCertificate",
    allowed: SA,
    write: true,
    call: () => certificates.revokeCertificate(NOBODY, {}, meta()),
  },
  {
    capability: "revoke",
    name: "runCertificateJobNow",
    allowed: SA,
    write: true,
    denyOnly: true,
    call: () => certificates.runCertificateJobNow(),
  },
  // Contracts and invoices (ETB) — HA R(own), SA W (Appendix C also EF R: open question)
  {
    capability: "billing",
    name: "createContract",
    allowed: SA,
    write: true,
    call: () => billing.createContract({}),
  },
  {
    capability: "billing",
    name: "updateContract",
    allowed: SA,
    write: true,
    call: () => billing.updateContract(NOBODY, {}),
  },
  {
    capability: "billing",
    name: "runMonthlyInvoicesNow",
    allowed: SA,
    write: true,
    call: () => billing.runMonthlyInvoicesNow({ month: "bad" }),
  },
  {
    capability: "billing",
    name: "issueInvoice",
    allowed: SA,
    write: true,
    call: () => billing.issueInvoice(NOBODY),
  },
  {
    capability: "billing",
    name: "settleInvoice",
    allowed: SA,
    write: true,
    call: () => billing.settleInvoice(NOBODY, {}),
  },
  {
    capability: "billing",
    name: "cancelInvoice",
    allowed: SA,
    write: true,
    call: () => billing.cancelInvoice(NOBODY, {}),
  },
  {
    capability: "billing",
    name: "invoicePdf",
    allowed: ["super_admin", "hospital_admin"],
    call: () => billing.invoicePdf(NOBODY),
  },
  // Dashboards and exports — R(own) per role (Appendix C also DR / DO exports: open question)
  {
    capability: "exports",
    name: "exportReport waste",
    allowed: ["super_admin", "efda_officer", ...HOSP],
    call: () => exportReport("waste", "bad-format"),
  },
  {
    capability: "exports",
    name: "exportReport certificates",
    allowed: ["super_admin", "efda_officer", ...HOSP],
    call: () => exportReport("certificates", "bad-format"),
  },
  {
    capability: "exports",
    name: "exportReport invoices",
    allowed: ["super_admin", "hospital_admin"],
    call: () => exportReport("invoices", "bad-format"),
  },
  {
    capability: "exports",
    name: "exportReport audit",
    allowed: ["super_admin", "efda_officer"],
    call: () => exportReport("audit", "bad-format"),
  },
  // Audit ledger and integrity check — SA R, EF R
  {
    capability: "audit",
    name: "checkAuditChain",
    allowed: ["super_admin", "efda_officer"],
    call: () => checkAuditChain(),
  },
  // Medicine stock and expiry (CLAUDE.md §12, Gate 8): hospital roles own facility; SA / EFDA read all; EFDA alone
  // decides requests; driver and disposal operator have no access at all.
  {
    capability: "stock",
    name: "previewStockFile",
    allowed: HOSP,
    write: true,
    call: () => medicine.previewStockFile({ name: "x.csv", bytes: new Uint8Array() }),
  },
  {
    capability: "stock",
    name: "saveStockImport",
    allowed: HOSP,
    write: true,
    call: () => medicine.saveStockImport({}),
  },
  {
    capability: "stock",
    name: "addStockLine",
    allowed: HOSP,
    write: true,
    call: () => medicine.addStockLine({}),
  },
  {
    capability: "stock",
    name: "updateStockLine",
    allowed: HOSP,
    write: true,
    call: () => medicine.updateStockLine(NOBODY, {}),
  },
  {
    capability: "stock",
    name: "archiveStockLine",
    allowed: HOSP,
    write: true,
    call: () => medicine.archiveStockLine(NOBODY),
  },
  {
    capability: "stock",
    name: "createDisposalRequest",
    allowed: ["hospital_admin"], // owner decision 11 Oct 2026: not hospital_staff
    write: true,
    call: () => medicine.createDisposalRequest({}, { idempotencyKey: null }),
  },
  {
    capability: "stock",
    name: "decideDisposalRequest",
    allowed: ["efda_officer"],
    write: true,
    efdaWrite: true,
    call: () => medicine.decideDisposalRequest(NOBODY, {}),
  },
  {
    capability: "stock",
    name: "getStockPage",
    allowed: [...HOSP, "super_admin", "efda_officer"],
    call: () => medicineQ.getStockPage("all", null, null),
  },
  {
    capability: "stock",
    name: "getStockAlerts",
    allowed: [...HOSP, "super_admin", "efda_officer"],
    call: () => medicineQ.getStockAlerts(),
  },
  {
    capability: "stock",
    name: "getDisposalRequests",
    allowed: [...HOSP, "super_admin", "efda_officer"],
    call: () => medicineQ.getDisposalRequests(),
  },
  {
    capability: "stock",
    name: "getStockFacilityOptions",
    allowed: ["super_admin", "efda_officer"],
    call: () => medicineQ.getStockFacilityOptions(),
  },
  {
    capability: "stock",
    name: "exportReport stock",
    allowed: ["super_admin", "efda_officer", ...HOSP],
    call: () => exportReport("stock", "bad-format"),
  },
  {
    capability: "stock",
    name: "exportReport medicine-requests",
    allowed: ["super_admin", "efda_officer", ...HOSP],
    call: () => exportReport("medicine-requests", "bad-format"),
  },
  // Dashboards (queries)
  {
    capability: "dashboards",
    name: "getAdminKpis",
    allowed: SA,
    call: () => adminQ.getAdminKpis(),
  },
  {
    capability: "dashboards",
    name: "getAdminAlerts",
    allowed: SA,
    call: () => adminQ.getAdminAlerts(),
  },
  {
    capability: "dashboards",
    name: "getAdminInvoicesPage",
    allowed: SA,
    call: () => adminQ.getAdminInvoicesPage(null),
  },
  {
    capability: "dashboards",
    name: "getAdminContracts",
    allowed: SA,
    call: () => adminQ.getAdminContracts(),
  },
  {
    capability: "dashboards",
    name: "getAdminCertificates",
    allowed: SA,
    call: () => adminQ.getAdminCertificates(),
  },
  {
    capability: "dashboards",
    name: "getAdminUsers",
    allowed: SA,
    call: () => adminQ.getAdminUsers(),
  },
  {
    capability: "dashboards",
    name: "getAdminFleet",
    allowed: SA,
    call: () => adminQ.getAdminFleet(),
  },
  {
    capability: "dashboards",
    name: "getAdminTrips",
    allowed: SA,
    call: () => adminQ.getAdminTrips(),
  },
  {
    capability: "dashboards",
    name: "getHospitalKpis",
    allowed: HOSP,
    call: () => hospitalQ.getHospitalKpis(),
  },
  {
    capability: "dashboards",
    name: "getHospitalWastePage",
    allowed: HOSP,
    call: () => hospitalQ.getHospitalWastePage(null),
  },
  {
    capability: "dashboards",
    name: "getHospitalCertificatesPage",
    allowed: HOSP,
    call: () => hospitalQ.getHospitalCertificatesPage(null),
  },
  {
    capability: "dashboards",
    name: "getHospitalInvoicesPage",
    allowed: ["hospital_admin"],
    call: () => hospitalQ.getHospitalInvoicesPage(null),
  },
  {
    capability: "dashboards",
    name: "getHospitalUsers",
    allowed: ["hospital_admin"],
    call: () => hospitalQ.getHospitalUsers(),
  },
  {
    capability: "dashboards",
    name: "getHospitalActiveHandovers",
    allowed: HOSP,
    call: () => hospitalQ.getHospitalActiveHandovers(),
  },
  {
    capability: "dashboards",
    name: "getDriverDashboard",
    allowed: ["driver"],
    call: () => driverQ.getDriverDashboard(),
  },
  {
    capability: "dashboards",
    name: "getDisposalDashboard",
    allowed: ["disposal_operator"],
    call: () => disposalQ.getDisposalDashboard(),
  },
  {
    capability: "dashboards",
    name: "getDisposalWork",
    allowed: ["disposal_operator"],
    call: () => disposalQ.getDisposalWork(),
  },
  {
    capability: "dashboards",
    name: "getRegulatorKpis",
    allowed: ["efda_officer"],
    call: () => regulatorQ.getRegulatorKpis("ALL", "ALL"),
  },
  {
    capability: "dashboards",
    name: "getRegulatorAuditPage",
    allowed: ["efda_officer"],
    call: () => regulatorQ.getRegulatorAuditPage(null),
  },
  {
    capability: "dashboards",
    name: "getRegulatorCertificatesPage",
    allowed: ["efda_officer"],
    call: () => regulatorQ.getRegulatorCertificatesPage("ALL", "ALL", null),
  },
  {
    capability: "dashboards",
    name: "getRegulatorEvidence",
    allowed: ["efda_officer"],
    call: () => regulatorQ.getRegulatorEvidence(),
  },
];

async function outcome(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
    return "ok";
  } catch (e) {
    if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
    throw e;
  }
}

describe("permission matrix (Appendix C × CLAUDE.md §3)", () => {
  for (const entry of MATRIX) {
    it(`${entry.capability}: ${entry.name}`, async () => {
      for (const role of ROLES) {
        session = users[role];
        const allowed = entry.allowed.includes(role);
        if (allowed && entry.denyOnly) continue;
        const result = await outcome(entry.call);
        if (allowed) {
          expect(result, `${role} should pass the role check of ${entry.name}`).not.toBe(
            "403 FORBIDDEN"
          );
        } else {
          expect(result, `${role} must be refused by ${entry.name}`).toBe("403 FORBIDDEN");
        }
      }
    }, 300_000);
  }

  it("efda_officer is refused by every write except deciding medicine requests (CLAUDE.md §3 / §12)", () => {
    for (const e of MATRIX.filter((x) => x.write && !x.efdaWrite)) {
      expect(e.allowed, e.name).not.toContain("efda_officer");
    }
    expect(MATRIX.filter((x) => x.efdaWrite).map((x) => x.name)).toEqual(["decideDisposalRequest"]);
  });

  it("driver and disposal_operator have no access to anything of medicine stock (CLAUDE.md §12)", () => {
    for (const e of MATRIX.filter((x) => x.capability === "stock")) {
      expect(e.allowed, e.name).not.toContain("driver");
      expect(e.allowed, e.name).not.toContain("disposal_operator");
    }
  });

  it("every role appears in the matrix as allowed somewhere (no role is left without a function)", () => {
    for (const role of ROLES)
      expect(
        MATRIX.some((e) => e.allowed.includes(role)),
        role
      ).toBe(true);
  });
});
