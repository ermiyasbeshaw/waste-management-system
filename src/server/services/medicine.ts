import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import QRCode from "qrcode";
import { toEatDateString } from "@/lib/dates";
import { env } from "@/env";
import {
  MAX_IMPORT_ROWS,
  parseCsv,
  previewTable,
  reachedThresholds,
  stockLineKey,
  stockLineSchema,
  type ImportPreview,
  type StockLineInput,
} from "@/lib/stock-import";
import { decisionSchema, disposalRequestSchema } from "@/lib/validation/medicine";
import { writeAudit } from "@/server/audit/writer";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { requireRole } from "@/server/auth/current-user";
import { nextCode } from "@/server/db/codes";
import type { DbExecutor } from "@/server/db/executor";
import { AppError } from "@/server/errors";
import { withIdempotency } from "@/server/idempotency/store";
import { renderCertificatePdf } from "@/server/integrations/pdf/certificate";
import { getStorage } from "@/server/integrations/storage";
import { readXlsxTable } from "@/server/integrations/xlsx";
import { enqueueMessage } from "@/server/outbox/enqueue";
import { inWorkflow, transition } from "@/server/workflow/engine";
import { friendlyDbError, invalid } from "./_errors";
import { getSetting } from "./settings";
import { registerWasteTx } from "./waste";

/**
 * Medicine stock and expiry (CLAUDE.md §12, modules 21–22, Gate 8). Writes:
 * - hospital_staff: their OWN facility's stock (import, add, edit, archive);
 * - hospital_admin: read-only on stock; creates disposal requests;
 * - efda_officer: ONLY approve / reject disposal requests (Workflow Engine);
 * - super_admin: read only here; driver and disposal_operator: no access at all.
 * Every change is audited; messages go through the outbox; nothing is ever hard-deleted.
 */

const HOSPITAL: Role[] = ["hospital_admin", "hospital_staff"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const today = () => toEatDateString(new Date());
const one = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows[0] as T | undefined;
const all = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows as T[];
const actorOf = (u: ActiveUser) => ({ userId: u.id, role: u.role });

async function hospitalUser(): Promise<ActiveUser & { facilityId: string }> {
  const user = await requireRole(...(HOSPITAL as ("hospital_admin" | "hospital_staff")[]));
  if (!user.facilityId)
    throw new AppError("FORBIDDEN", 403, "Your account is not linked to a facility.");
  return user as ActiveUser & { facilityId: string };
}

async function hospitalStaffUser(): Promise<ActiveUser & { facilityId: string }> {
  const user = await requireRole("hospital_staff");
  if (!user.facilityId)
    throw new AppError("FORBIDDEN", 403, "Your account is not linked to a facility.");
  return user as ActiveUser & { facilityId: string };
}

// ---------------------------------------------------------------- 8.2 stock import

/** Reads an uploaded CSV / XLSX file and returns the rows with their errors. Nothing is saved. */
export async function previewStockFile(file: {
  name: string;
  bytes: Uint8Array;
}): Promise<ImportPreview> {
  await hospitalStaffUser();
  if (file.bytes.byteLength === 0)
    throw new AppError("VALIDATION_ERROR", 422, "The file is empty.");
  if (file.bytes.byteLength > MAX_FILE_BYTES) {
    throw new AppError("VALIDATION_ERROR", 422, "The file is too large (at most 5 MB).");
  }
  const name = file.name.toLowerCase();
  let table: unknown[][];
  if (name.endsWith(".csv")) table = parseCsv(new TextDecoder("utf-8").decode(file.bytes));
  else if (name.endsWith(".xlsx")) {
    try {
      table = await readXlsxTable(file.bytes);
    } catch {
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "This Excel file could not be read. Save it as .xlsx or CSV."
      );
    }
  } else throw new AppError("VALIDATION_ERROR", 422, "Upload an Excel (.xlsx) or CSV file.");
  return previewTable(table);
}

type StockRowDb = {
  id: string;
  item: string;
  strength: string;
  form: string;
  batch: string;
  quantity: number;
  unit: string;
  expiry_date: string;
  active: boolean;
};
const STOCK_COLS = sql`id, item, strength, form, batch, quantity, unit, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, active`;
const snapshot = (r: Pick<StockRowDb, "quantity" | "unit" | "expiry_date" | "active">) => ({
  quantity: Number(r.quantity),
  unit: r.unit,
  expiryDate: r.expiry_date,
  active: r.active,
});

/**
 * Saves checked lines for the user's facility. A line with the same item + strength + form + batch replaces the
 * existing line's quantity, unit and expiry (ASSUMPTION: the upload is a stock count); new lines are added.
 * One audit entry lists every change (before / after).
 */
export async function saveStockImport(raw: unknown, requestId?: string) {
  const user = await hospitalStaffUser();
  const lines = (raw as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError("VALIDATION_ERROR", 422, "There are no stock lines to save.");
  }
  if (lines.length > MAX_IMPORT_ROWS) {
    throw new AppError("VALIDATION_ERROR", 422, `At most ${MAX_IMPORT_ROWS} lines per file.`);
  }
  const parsed: StockLineInput[] = [];
  const keys = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const l: unknown = lines[i];
    const r = stockLineSchema.safeParse(l);
    if (!r.success) {
      throw new AppError("VALIDATION_ERROR", 422, `Line ${i + 1}: ${r.error.issues[0].message}`);
    }
    const key = stockLineKey(r.data);
    if (keys.has(key)) throw new AppError("VALIDATION_ERROR", 422, `Line ${i + 1} appears twice.`);
    keys.add(key);
    parsed.push(r.data);
  }
  return inWorkflow(async (tx) => {
    const existing = await all<StockRowDb>(
      tx,
      sql`SELECT ${STOCK_COLS} FROM medicine_stock WHERE facility_id = ${user.facilityId} FOR UPDATE`
    );
    const byKey = new Map(existing.map((e) => [stockLineKey(e), e]));
    const changes: Record<string, unknown>[] = [];
    let created = 0;
    let updated = 0;
    for (const l of parsed) {
      const old = byKey.get(stockLineKey(l));
      if (old) {
        await tx.execute(
          sql`UPDATE medicine_stock SET quantity = ${l.quantity}, unit = ${l.unit}, expiry_date = ${l.expiryDate}::date,
                     active = true
              WHERE id = ${old.id}`
        );
        changes.push({
          id: old.id,
          batch: l.batch,
          before: snapshot(old),
          after: { quantity: l.quantity, unit: l.unit, expiryDate: l.expiryDate, active: true },
        });
        updated++;
      } else {
        const row = await one<{ id: string }>(
          tx,
          sql`INSERT INTO medicine_stock (facility_id, item, strength, form, batch, quantity, unit, expiry_date, created_by)
              VALUES (${user.facilityId}, ${l.item}, ${l.strength}, ${l.form}, ${l.batch}, ${l.quantity}, ${l.unit},
                      ${l.expiryDate}::date, ${user.id})
              RETURNING id`
        );
        changes.push({
          id: row!.id,
          item: l.item,
          batch: l.batch,
          after: { quantity: l.quantity, unit: l.unit, expiryDate: l.expiryDate },
        });
        created++;
      }
    }
    await writeAudit(tx, {
      actor: actorOf(user),
      action: "stock.imported",
      entityType: "medicine_stock",
      entityId: user.facilityId,
      after: { created, updated, changes },
      requestId,
    });
    return { created, updated };
  });
}

/** Adds one line by hand (a line with the same item / strength / form / batch must be edited instead). */
export async function addStockLine(raw: unknown, requestId?: string) {
  const user = await hospitalStaffUser();
  const parsed = stockLineSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const l = parsed.data;
  return inWorkflow(async (tx) => {
    const row = await tx
      .execute(
        sql`INSERT INTO medicine_stock (facility_id, item, strength, form, batch, quantity, unit, expiry_date, created_by)
            VALUES (${user.facilityId}, ${l.item}, ${l.strength}, ${l.form}, ${l.batch}, ${l.quantity}, ${l.unit},
                    ${l.expiryDate}::date, ${user.id})
            RETURNING id`
      )
      .catch((e: unknown) => {
        const code =
          (e as { code?: string; cause?: { code?: string } }).code ??
          (e as { cause?: { code?: string } }).cause?.code;
        if (code === "23505") {
          throw new AppError(
            "CONFLICT",
            409,
            "This batch is already in the stock list. Edit that line instead."
          );
        }
        return friendlyDbError(e);
      });
    const id = (row.rows[0] as { id: string }).id;
    await writeAudit(tx, {
      actor: actorOf(user),
      action: "stock.created",
      entityType: "medicine_stock",
      entityId: id,
      after: { ...l },
      requestId,
    });
    return { id };
  });
}

/** Locks one active line of the user's OWN facility (another facility's line is "not found"). */
async function ownLine(tx: DbExecutor, user: ActiveUser & { facilityId: string }, id: string) {
  if (!UUID.test(id)) throw new AppError("NOT_FOUND", 404, "Stock line not found.");
  const row = await one<StockRowDb>(
    tx,
    sql`SELECT ${STOCK_COLS} FROM medicine_stock WHERE id = ${id} AND facility_id = ${user.facilityId} FOR UPDATE`
  );
  if (!row) throw new AppError("NOT_FOUND", 404, "Stock line not found.");
  return row;
}

/** Edits one line (history: the audit log keeps the values before and after). */
export async function updateStockLine(id: string, raw: unknown, requestId?: string) {
  const user = await hospitalStaffUser();
  const parsed = stockLineSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const l = parsed.data;
  return inWorkflow(async (tx) => {
    const old = await ownLine(tx, user, id);
    await tx
      .execute(
        sql`UPDATE medicine_stock SET item = ${l.item}, strength = ${l.strength}, form = ${l.form}, batch = ${l.batch},
                   quantity = ${l.quantity}, unit = ${l.unit}, expiry_date = ${l.expiryDate}::date
            WHERE id = ${id}`
      )
      .catch((e: unknown) => {
        const code =
          (e as { code?: string; cause?: { code?: string } }).code ??
          (e as { cause?: { code?: string } }).cause?.code;
        if (code === "23505")
          throw new AppError("CONFLICT", 409, "Another line already has this item and batch.");
        return friendlyDbError(e);
      });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: "stock.updated",
      entityType: "medicine_stock",
      entityId: id,
      before: {
        item: old.item,
        strength: old.strength,
        form: old.form,
        batch: old.batch,
        ...snapshot(old),
      },
      after: { ...l },
      requestId,
    });
    return { id };
  });
}

/** Removes a line from the list without deleting it (history kept). */
export async function archiveStockLine(id: string, requestId?: string) {
  const user = await hospitalStaffUser();
  return inWorkflow(async (tx) => {
    const old = await ownLine(tx, user, id);
    if (!old.active) throw new AppError("CONFLICT", 409, "This line is already archived.");
    await tx.execute(sql`UPDATE medicine_stock SET active = false WHERE id = ${id}`);
    await writeAudit(tx, {
      actor: actorOf(user),
      action: "stock.archived",
      entityType: "medicine_stock",
      entityId: id,
      before: { active: true },
      after: { active: false },
      requestId,
    });
    return { id };
  });
}

// ---------------------------------------------------------------- 8.3 expiry alerts

/**
 * Daily expiry check (CLAUDE.md §12): for every active line with stock left, each reached threshold
 * (`expiry_alert_days` and the expiry day) is recorded once. One email per facility and recipient lists the lines
 * that got a new alert (facility hospital_staff + hospital_admin users + every efda_officer). No SMS.
 */
export async function computeStockExpiryAlerts(day: string = today(), requestId?: string) {
  return inWorkflow(async (tx) => {
    const thresholds = await getSetting("expiry_alert_days", tx);
    const horizon = Math.max(...thresholds, 0);
    const lines = await all<{
      id: string;
      facility_id: string;
      facility_name: string;
      item: string;
      strength: string;
      batch: string;
      quantity: number;
      unit: string;
      expiry_date: string;
      alerted: number[] | null;
    }>(
      tx,
      sql`SELECT s.id, s.facility_id, f.name AS facility_name, s.item, s.strength, s.batch, s.quantity, s.unit,
                 to_char(s.expiry_date, 'YYYY-MM-DD') AS expiry_date,
                 (SELECT array_agg(a.threshold_days) FROM medicine_stock_alerts a WHERE a.stock_id = s.id) AS alerted
          FROM medicine_stock s JOIN facilities f ON f.id = s.facility_id
          WHERE s.active AND s.quantity > 0 AND s.expiry_date <= ${day}::date + ${horizon}::int
          ORDER BY s.facility_id, s.expiry_date
          FOR UPDATE OF s`
    );
    type Hit = {
      item: string;
      strength: string;
      batch: string;
      quantity: number;
      unit: string;
      expiryDate: string;
      daysLeft: number;
    };
    const byFacility = new Map<string, { name: string; hits: Hit[] }>();
    let alerts = 0;
    for (const l of lines) {
      const done = new Set((l.alerted ?? []).map(Number));
      const fresh = reachedThresholds(l.expiry_date, day, thresholds).filter((t) => !done.has(t));
      if (fresh.length === 0) continue;
      for (const t of fresh) {
        await tx.execute(
          sql`INSERT INTO medicine_stock_alerts (stock_id, threshold_days, alert_date)
              VALUES (${l.id}, ${t}, ${day}::date) ON CONFLICT DO NOTHING`
        );
        alerts++;
      }
      const daysLeft = Math.round(
        (Date.parse(`${l.expiry_date}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000
      );
      const entry = byFacility.get(l.facility_id) ?? { name: l.facility_name, hits: [] };
      entry.hits.push({
        item: l.item,
        strength: l.strength,
        batch: l.batch,
        quantity: Number(l.quantity),
        unit: l.unit,
        expiryDate: l.expiry_date,
        daysLeft,
      });
      byFacility.set(l.facility_id, entry);
    }

    let emails = 0;
    const efda = await all<{ email: string }>(
      tx,
      sql`SELECT email FROM users WHERE role = 'efda_officer' AND active AND email IS NOT NULL LIMIT 50`
    );
    for (const [facilityId, { name, hits }] of Array.from(byFacility.entries())) {
      const facilityUsers = await all<{ email: string }>(
        tx,
        sql`SELECT email FROM users WHERE facility_id = ${facilityId} AND role IN ('hospital_admin', 'hospital_staff')
              AND active AND email IS NOT NULL LIMIT 50`
      );
      const recipients = Array.from(
        new Set([...facilityUsers, ...efda].map((r) => r.email.toLowerCase()))
      );
      for (const to of recipients) {
        await enqueueMessage(tx, {
          template: "stock.expiry_alert",
          recipient: to,
          data: {
            facilityName: name,
            lines: hits.slice(0, 50),
            more: Math.max(0, hits.length - 50),
          },
        });
        emails++;
      }
      await writeAudit(tx, {
        actor: null,
        action: "stock.expiry_alerted",
        entityType: "facility",
        entityId: facilityId,
        after: { day, lines: hits.length, recipients: recipients.length },
        requestId,
      });
    }
    return { day, alerts, facilities: byFacility.size, emails };
  });
}

// ---------------------------------------------------------------- 8.4 disposal requests

export const CREATE_REQUEST_ROUTE = "action:createDisposalRequest";

/**
 * Hospital Staff (or Admin) creates a disposal request for stock lines of their own facility → PENDING_APPROVAL.
 * A unique QR code is generated for that specific disposal request.
 * The request remains pending until the Hospital Administrator approves it.
 */
export async function createDisposalRequest(
  raw: unknown,
  meta: { idempotencyKey: string | null | undefined; requestId?: string }
) {
  const user = await requireRole("hospital_admin", "hospital_staff");
  if (!user.facilityId) {
    throw new AppError("FORBIDDEN", 403, "Your account is not linked to a facility.");
  }
  const facilityUser = user as ActiveUser & { facilityId: string };
  const parsed = disposalRequestSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const input = parsed.data;
  return inWorkflow(async (tx) => {
    const result = await withIdempotency(
      tx,
      { key: meta.idempotencyKey, userId: facilityUser.id, route: CREATE_REQUEST_ROUTE, request: input },
      async () => {
        const ids = input.lines.map((l) => l.stockId);
        const stock = await all<StockRowDb>(
          tx,
          sql`SELECT ${STOCK_COLS} FROM medicine_stock
              WHERE facility_id = ${facilityUser.facilityId} AND id IN (${sql.join(
                ids.map((i) => sql`${i}::uuid`),
                sql`, `
              )})
              FOR UPDATE`
        );
        const byId = new Map(stock.map((s) => [s.id, s]));
        for (const l of input.lines) {
          const s = byId.get(l.stockId);
          if (!s || !s.active)
            throw new AppError("NOT_FOUND", 404, "A chosen stock line was not found.");
          if (l.quantity > Number(s.quantity)) {
            throw new AppError(
              "QUANTITY_TOO_HIGH",
              409,
              `Only ${s.quantity} ${s.unit} of ${s.item} (${s.batch}) in stock.`
            );
          }
        }
        const requestCode = await nextCode(tx, "medicine_request");
        const hexToken = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
        const qrCode = `QR-${requestCode}-${hexToken}`;
        const req = (await one<{ id: string }>(
          tx,
          sql`INSERT INTO medicine_disposal_requests (request_code, facility_id, requested_by, note, container_count, weight_kg, scheduled_date, qr_code)
              VALUES (${requestCode}, ${facilityUser.facilityId}, ${facilityUser.id}, ${input.note}, ${input.containerCount},
                      ${input.weightKg.toFixed(2)}, ${input.scheduledDate ? sql`${input.scheduledDate}::date` : null}, ${qrCode})
              RETURNING id`
        ))!;
        for (const l of input.lines) {
          const s = byId.get(l.stockId)!;
          await tx.execute(
            sql`INSERT INTO medicine_disposal_request_lines
                  (request_id, stock_id, quantity, item, strength, form, batch, unit, expiry_date)
                VALUES (${req.id}, ${s.id}, ${l.quantity}, ${s.item}, ${s.strength}, ${s.form}, ${s.batch}, ${s.unit},
                        ${s.expiry_date}::date)`
          );
        }
        await writeAudit(tx, {
          actor: actorOf(facilityUser),
          action: "medicine_request.created",
          entityType: "medicine_request",
          entityId: req.id,
          after: {
            requestCode,
            qrCode,
            status: "PENDING_APPROVAL",
            lines: input.lines.length,
            containerCount: input.containerCount,
            weightKg: input.weightKg,
            scheduledDate: input.scheduledDate,
          },
          requestId: meta.requestId,
        });
        return { status: 201, body: { id: req.id, requestCode, qrCode } };
      }
    );
    return result.body;
  });
}

/**
 * Decision on disposal request:
 * - Hospital Administrator reviews & approves/rejects requests for their own facility.
 *   → If request contains expired medicines → PENDING_EFDA_APPROVAL
 *   → If no expired medicines → PENDING_DRIVER_ASSIGNMENT (goes to Super Admin)
 * - EFDA officer reviews & approves/rejects PENDING_EFDA_APPROVAL requests.
 *   → APPROVE → PENDING_DRIVER_ASSIGNMENT (goes to Super Admin)
 *   → REJECT → REJECTED
 * REJECT by Hospital Admin: status moves to REJECTED with mandatory reason.
 */
export async function decideDisposalRequest(id: string, raw: unknown, requestId?: string) {
  const user = await requireRole("hospital_admin", "efda_officer");
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  if (!UUID.test(id)) throw new AppError("NOT_FOUND", 404, "Request not found.");

  return inWorkflow(async (tx) => {
    const req = await one<{
      id: string;
      request_code: string;
      status: string;
      facility_id: string;
      container_count: number;
      weight_kg: string;
      contains_expired: boolean | null;
      requester_id: string;
      requester_role: Role | null;
      requester_facility: string | null;
      requester_active: boolean;
    }>(
      tx,
      sql`SELECT r.id, r.request_code, r.status, r.facility_id, r.container_count, r.weight_kg,
                 r.contains_expired,
                 u.id AS requester_id, u.role AS requester_role, u.facility_id AS requester_facility,
                 u.active AS requester_active
          FROM medicine_disposal_requests r JOIN users u ON u.id = r.requested_by
          WHERE r.id = ${id} FOR UPDATE OF r`
    );
    if (!req) throw new AppError("NOT_FOUND", 404, "Request not found.");

    // Hospital Admin can only review their own hospital's requests
    if (user.role === "hospital_admin" && user.facilityId !== req.facility_id) {
      throw new AppError(
        "FORBIDDEN",
        403,
        "Hospital administrators can only review requests from their own hospital."
      );
    }

    // EFDA officer can only review PENDING_EFDA_APPROVAL requests
    if (user.role === "efda_officer" && req.status !== "PENDING_EFDA_APPROVAL") {
      throw new AppError(
        "INVALID_TRANSITION",
        409,
        "EFDA officers can only review requests that are pending EFDA approval."
      );
    }

    // Hospital Admin can only review PENDING_APPROVAL requests
    if (user.role === "hospital_admin" && req.status !== "PENDING_APPROVAL") {
      throw new AppError("INVALID_TRANSITION", 409, "Request is already decided.");
    }

    const now = new Date();

    // ---- REJECT ----
    if (parsed.data.decision === "REJECT") {
      if (user.role === "efda_officer") {
        // EFDA rejects PENDING_EFDA_APPROVAL → REJECTED
        await tx.execute(
          sql`UPDATE medicine_disposal_requests
              SET status = 'REJECTED',
                  efda_decided_by = ${user.id},
                  efda_decided_at = ${now},
                  efda_decision_reason = ${parsed.data.reason}
              WHERE id = ${id}`
        );
        await writeAudit(tx, {
          actor: actorOf(user),
          action: "medicine_request.efda_rejected",
          entityType: "medicine_request",
          entityId: id,
          after: { status: "REJECTED", reason: parsed.data.reason, efdaOfficerId: user.id },
          requestId,
        });
      } else {
        // Hospital Admin rejects PENDING_APPROVAL → REJECTED
        await tx.execute(
          sql`UPDATE medicine_disposal_requests
              SET status = 'REJECTED',
                  decided_by = ${user.id},
                  decided_at = ${now},
                  decision_reason = ${parsed.data.reason}
              WHERE id = ${id}`
        );
        await writeAudit(tx, {
          actor: actorOf(user),
          action: "medicine_request.rejected",
          entityType: "medicine_request",
          entityId: id,
          after: { status: "REJECTED", reason: parsed.data.reason },
          requestId,
        });
      }
      return { requestCode: req.request_code, status: "REJECTED" as const, wasteCode: null };
    }

    // ---- APPROVE ----
    if (user.role === "efda_officer") {
      // EFDA approves PENDING_EFDA_APPROVAL → PENDING_DRIVER_ASSIGNMENT
      await tx.execute(
        sql`UPDATE medicine_disposal_requests
            SET status = 'PENDING_DRIVER_ASSIGNMENT',
                efda_decided_by = ${user.id},
                efda_decided_at = ${now}
            WHERE id = ${id}`
      );
      await writeAudit(tx, {
        actor: actorOf(user),
        action: "medicine_request.efda_approved",
        entityType: "medicine_request",
        entityId: id,
        after: { status: "PENDING_DRIVER_ASSIGNMENT", efdaOfficerId: user.id },
        requestId,
      });

      // Notify Super Admin that a request is ready for driver assignment
      const superAdmins = await all<{ email: string }>(
        tx,
        sql`SELECT email FROM users WHERE role = 'super_admin' AND active AND email IS NOT NULL LIMIT 20`
      );
      for (const a of superAdmins) {
        await enqueueMessage(tx, {
          template: "disposal.pending_driver_assignment",
          recipient: a.email,
          data: {
            requestCode: req.request_code,
            containsExpired: true,
            efdaApproved: true,
          },
        });
      }

      return {
        requestCode: req.request_code,
        status: "PENDING_DRIVER_ASSIGNMENT" as const,
        wasteCode: null,
      };
    }

    // Hospital Admin approves PENDING_APPROVAL
    const decided = { decidedBy: user.id, decidedAt: now };

    // Check if any lines contain expired medicines
    const lines = await all<{
      stock_id: string;
      quantity: number;
      item: string;
      batch: string;
      stock_qty: number;
      unit: string;
      expiry_date: string;
    }>(
      tx,
      sql`SELECT l.stock_id, l.quantity, l.item, l.batch, s.quantity AS stock_qty, s.unit,
                 to_char(s.expiry_date, 'YYYY-MM-DD') AS expiry_date
          FROM medicine_disposal_request_lines l JOIN medicine_stock s ON s.id = l.stock_id
          WHERE l.request_id = ${id}
          FOR UPDATE OF s`
    );

    // Check stock availability
    for (const l of lines) {
      if (Number(l.quantity) > Number(l.stock_qty)) {
        throw new AppError(
          "QUANTITY_TOO_HIGH",
          409,
          `${l.item} (${l.batch}): only ${l.stock_qty} ${l.unit} left in stock; the hospital must make a new request.`
        );
      }
    }

    // Determine if request or any medicine is expired
    const todayStr = today();
    const containsExpired =
      Boolean(req.contains_expired) || lines.some((l) => l.expiry_date <= todayStr);

    if (containsExpired) {
      // Route to EFDA for additional approval
      await tx.execute(
        sql`UPDATE medicine_disposal_requests
            SET status = 'PENDING_EFDA_APPROVAL',
                decided_by = ${user.id},
                decided_at = ${now},
                contains_expired = true
            WHERE id = ${id}`
      );
      await writeAudit(tx, {
        actor: actorOf(user),
        action: "medicine_request.hospital_approved_to_efda",
        entityType: "medicine_request",
        entityId: id,
        after: { status: "PENDING_EFDA_APPROVAL", containsExpired: true, decidedBy: user.id },
        requestId,
      });

      // Notify EFDA officers
      const efdaOfficers = await all<{ email: string }>(
        tx,
        sql`SELECT email FROM users WHERE role = 'efda_officer' AND active AND email IS NOT NULL LIMIT 20`
      );
      for (const e of efdaOfficers) {
        await enqueueMessage(tx, {
          template: "disposal.pending_efda_approval",
          recipient: e.email,
          data: { requestCode: req.request_code, containsExpired: true },
        });
      }

      return {
        requestCode: req.request_code,
        status: "PENDING_EFDA_APPROVAL" as const,
        wasteCode: null,
      };
    }

    // No expired medicines → go directly to PENDING_DRIVER_ASSIGNMENT (Super Admin assigns driver)
    await tx.execute(
      sql`UPDATE medicine_disposal_requests
          SET status = 'PENDING_DRIVER_ASSIGNMENT',
              decided_by = ${user.id},
              decided_at = ${now},
              contains_expired = false
          WHERE id = ${id}`
    );
    await writeAudit(tx, {
      actor: actorOf(user),
      action: "medicine_request.hospital_approved",
      entityType: "medicine_request",
      entityId: id,
      after: { status: "PENDING_DRIVER_ASSIGNMENT", decidedBy: user.id },
      requestId,
    });

    // Notify Super Admin that a request is ready for driver assignment
    const superAdmins = await all<{ email: string }>(
      tx,
      sql`SELECT email FROM users WHERE role = 'super_admin' AND active AND email IS NOT NULL LIMIT 20`
    );
    for (const a of superAdmins) {
      await enqueueMessage(tx, {
        template: "disposal.pending_driver_assignment",
        recipient: a.email,
        data: { requestCode: req.request_code, containsExpired: false },
      });
    }

    return {
      requestCode: req.request_code,
      status: "PENDING_DRIVER_ASSIGNMENT" as const,
      wasteCode: null,
    };
  });
}

/**
 * Super Admin assigns a driver and vehicle to a disposal request (PENDING_DRIVER_ASSIGNMENT → APPROVED).
 * This triggers stock reduction, waste record creation, links the vehicle and destination facility,
 * and moves the request to APPROVED for pickup.
 */
export async function assignDriverToRequest(
  id: string,
  driverUserId: string,
  vehicleId?: string | null,
  requestId?: string
) {
  const admin = await requireRole("super_admin");
  if (!UUID.test(id)) throw new AppError("NOT_FOUND", 404, "Request not found.");
  if (!UUID.test(driverUserId)) throw new AppError("VALIDATION_ERROR", 422, "Invalid driver ID.");
  if (vehicleId && !UUID.test(vehicleId)) throw new AppError("VALIDATION_ERROR", 422, "Invalid vehicle ID.");

  return inWorkflow(async (tx) => {
    // Verify driver exists and is active, and lookup default vehicle
    const driver = await one<{
      id: string;
      full_name: string;
      email: string | null;
      default_vehicle_id: string | null;
    }>(
      tx,
      sql`SELECT u.id, u.full_name, u.email, d.default_vehicle_id
          FROM users u
          LEFT JOIN drivers d ON d.user_id = u.id
          WHERE u.id = ${driverUserId} AND u.role = 'driver' AND u.active FOR UPDATE`
    );
    if (!driver) throw new AppError("NOT_FOUND", 404, "Driver not found or inactive.");

    // Resolve vehicle
    let resolvedVehicleId = vehicleId || driver.default_vehicle_id;
    let vehiclePlate: string | null = null;
    if (resolvedVehicleId) {
      const v = await one<{ id: string; plate_no: string }>(
        tx,
        sql`SELECT id, plate_no FROM vehicles WHERE id = ${resolvedVehicleId} AND active`
      );
      if (v) {
        resolvedVehicleId = v.id;
        vehiclePlate = v.plate_no;
      } else {
        resolvedVehicleId = null;
      }
    }

    // Resolve destination disposal facility
    const disposalSite = await one<{ id: string; name: string }>(
      tx,
      sql`SELECT id, name FROM facilities WHERE type = 'DISPOSAL_SITE' AND status = 'ACTIVE' LIMIT 1`
    );

    const req = await one<{
      id: string;
      request_code: string;
      status: string;
      facility_id: string;
      container_count: number;
      weight_kg: string;
      requester_id: string;
      requester_role: Role | null;
      requester_facility: string | null;
      requester_active: boolean;
      facility_name: string;
      waste_record_id: string | null;
      driver_id: string | null;
      waste_code: string | null;
    }>(
      tx,
      sql`SELECT r.id, r.request_code, r.status, r.facility_id, r.container_count, r.weight_kg,
                 r.waste_record_id, r.driver_id, w.waste_code,
                 u.id AS requester_id, u.role AS requester_role, u.facility_id AS requester_facility,
                 u.active AS requester_active, f.name AS facility_name
          FROM medicine_disposal_requests r
          JOIN users u ON u.id = r.requested_by
          JOIN facilities f ON f.id = r.facility_id
          LEFT JOIN waste_records w ON w.id = r.waste_record_id
          WHERE r.id = ${id} FOR UPDATE OF r`
    );
    if (!req) throw new AppError("NOT_FOUND", 404, "Request not found.");

    const canAssign =
      req.status === "PENDING_DRIVER_ASSIGNMENT" ||
      (req.status === "APPROVED" && (!req.driver_id || req.driver_id !== driver.id));

    if (!canAssign) {
      throw new AppError(
        "INVALID_TRANSITION",
        409,
        `Cannot assign driver. Request must be in 'Pending Driver Assignment' or unassigned Approved status (current: ${req.status}).`
      );
    }

    let wasteRecordId = req.waste_record_id;
    let wasteCode = req.waste_code;

    // Reduce stock and create waste record only if not already done
    if (!wasteRecordId) {
      const lines = await all<{
        stock_id: string;
        quantity: number;
        item: string;
        batch: string;
        stock_qty: number;
        unit: string;
      }>(
        tx,
        sql`SELECT l.stock_id, l.quantity, l.item, l.batch, s.quantity AS stock_qty, s.unit
            FROM medicine_disposal_request_lines l JOIN medicine_stock s ON s.id = l.stock_id
            WHERE l.request_id = ${id}
            FOR UPDATE OF s`
      );
      for (const l of lines) {
        if (Number(l.quantity) > Number(l.stock_qty)) {
          throw new AppError(
            "QUANTITY_TOO_HIGH",
            409,
            `${l.item} (${l.batch}): only ${l.stock_qty} ${l.unit} left in stock; the hospital must make a new request.`
          );
        }
      }
      for (const l of lines) {
        await tx.execute(
          sql`UPDATE medicine_stock SET quantity = quantity - ${l.quantity} WHERE id = ${l.stock_id}`
        );
      }
      await writeAudit(tx, {
        actor: actorOf(admin),
        action: "stock.reduced",
        entityType: "medicine_request",
        entityId: id,
        after: {
          lines: lines.map((l) => ({
            stockId: l.stock_id,
            quantity: Number(l.quantity),
            before: Number(l.stock_qty),
          })),
        },
        requestId,
      });

      // Check requester validity
      if (
        !req.requester_active ||
        req.requester_facility !== req.facility_id ||
        !req.requester_role
      ) {
        throw new AppError(
          "REQUESTER_INACTIVE",
          409,
          "The person who made this request no longer has access; ask the facility to request again."
        );
      }

      // Create waste record
      const waste = await registerWasteTx(
        tx,
        { id: req.requester_id, role: req.requester_role, facilityId: req.facility_id, active: true },
        {
          categoryCode: "PHARMACEUTICAL",
          containerCount: Number(req.container_count),
          weightKg: Number(req.weight_kg),
        },
        requestId,
        { viaApprovedRequest: true }
      );
      wasteRecordId = waste.id;
      wasteCode = waste.wasteCode;
    }

    const now = new Date();
    await tx.execute(
      sql`UPDATE medicine_disposal_requests
          SET status = 'APPROVED',
              driver_id = ${driver.id},
              vehicle_id = ${resolvedVehicleId},
              destination_facility_id = ${disposalSite?.id ?? null},
              assigned_by = ${admin.id},
              assigned_at = ${now},
              waste_record_id = ${wasteRecordId}
          WHERE id = ${id}`
    );

    await writeAudit(tx, {
      actor: actorOf(admin),
      action: "medicine_request.driver_assigned",
      entityType: "medicine_request",
      entityId: id,
      after: {
        status: "APPROVED",
        driverId: driver.id,
        driverName: driver.full_name,
        vehicleId: resolvedVehicleId,
        vehiclePlate,
        destinationFacilityId: disposalSite?.id ?? null,
        assignedBy: admin.id,
        wasteRecordId: wasteRecordId,
      },
      requestId,
    });

    // Notify driver
    if (driver.email) {
      await enqueueMessage(tx, {
        template: "disposal.driver_assigned",
        recipient: driver.email,
        data: {
          requestCode: req.request_code,
          facilityName: req.facility_name,
          driverName: driver.full_name,
        },
      });
    }

    // Notify hospital
    const hospitalUsers = await all<{ email: string }>(
      tx,
      sql`SELECT email FROM users WHERE facility_id = ${req.facility_id}
          AND role IN ('hospital_admin', 'hospital_staff') AND active AND email IS NOT NULL LIMIT 20`
    );
    for (const h of hospitalUsers) {
      await enqueueMessage(tx, {
        template: "disposal.driver_assigned",
        recipient: h.email,
        data: {
          requestCode: req.request_code,
          facilityName: req.facility_name,
          driverName: driver.full_name,
        },
      });
    }

    return {
      requestCode: req.request_code,
      status: "APPROVED" as const,
      wasteCode: wasteCode,
      driverId: driver.id,
      driverName: driver.full_name,
      vehicleId: resolvedVehicleId,
      vehiclePlate,
    };
  });
}

/**
 * Lists active drivers for the Super Admin to assign to disposal requests, including their default vehicle.
 */
export async function getAvailableDrivers() {
  await requireRole("super_admin");
  return inWorkflow(async (tx) => {
    return all<{
      id: string;
      full_name: string;
      email: string | null;
      license_no: string | null;
      default_vehicle_id: string | null;
      default_plate_no: string | null;
    }>(
      tx,
      sql`SELECT u.id, u.full_name, u.email, d.license_no, d.default_vehicle_id, v.plate_no AS default_plate_no
          FROM users u
          LEFT JOIN drivers d ON d.user_id = u.id
          LEFT JOIN vehicles v ON v.id = d.default_vehicle_id
          WHERE u.role = 'driver' AND u.active
          ORDER BY u.full_name`
    );
  });
}

/**
 * Lists active fleet vehicles for the Super Admin to assign to disposal requests.
 */
export async function getAvailableVehicles() {
  await requireRole("super_admin");
  return inWorkflow(async (tx) => {
    return all<{
      id: string;
      plate_no: string;
      model: string | null;
      capacity_kg: string;
    }>(
      tx,
      sql`SELECT id, plate_no, model, capacity_kg FROM vehicles WHERE active AND status = 'ACTIVE' ORDER BY plate_no`
    );
  });
}

/**
 * Gets disposal requests assigned to a specific driver with complete information (facility address, contact,
 * waste category, medicine items, expiry status, assigned vehicle, destination facility, and approval history).
 */
export async function getDriverAssignedRequests() {
  const user = await requireRole("driver");
  return inWorkflow(async (tx) => {
    return all<{
      id: string;
      request_code: string;
      status: string;
      facility_id: string;
      facility_name: string;
      facility_code: string;
      facility_address: string;
      facility_city: string | null;
      facility_sub_city: string | null;
      facility_woreda: string | null;
      facility_region: string;
      facility_lat: number;
      facility_lng: number;
      requested_by_name: string;
      requester_email: string | null;
      requester_phone: string | null;
      category_name: string;
      category_code: string;
      container_count: number;
      weight_kg: string;
      scheduled_date: string | null;
      note: string | null;
      qr_code: string | null;
      created_at: string;
      hospital_decided_by_name: string | null;
      decided_at: string | null;
      contains_expired: boolean;
      efda_decided_by_name: string | null;
      efda_decided_at: string | null;
      efda_decision_reason: string | null;
      assigned_by_name: string | null;
      assigned_at: string | null;
      vehicle_id: string | null;
      vehicle_plate_no: string | null;
      vehicle_model: string | null;
      vehicle_capacity_kg: string | null;
      destination_facility_id: string | null;
      destination_name: string | null;
      destination_code: string | null;
      destination_address: string | null;
      destination_city: string | null;
      driver_scanned_at: string | null;
      operator_name: string | null;
      operator_scanned_at: string | null;
      disposed_at: string | null;
      certificate_no: string | null;
      lines: {
        item: string;
        strength: string;
        form: string;
        batch: string;
        quantity: number;
        unit: string;
        expiry_date: string;
        is_expired: boolean;
      }[];
    }>(
      tx,
      sql`SELECT r.id, r.request_code, r.status, f.id AS facility_id, f.name AS facility_name, f.code AS facility_code,
                 f.address AS facility_address, f.city AS facility_city, f.sub_city AS facility_sub_city,
                 f.woreda AS facility_woreda, f.region AS facility_region, f.lat AS facility_lat, f.lng AS facility_lng,
                 u.full_name AS requested_by_name, u.email AS requester_email, u.phone AS requester_phone,
                 'Pharmaceutical Waste' AS category_name, 'PHARMACEUTICAL' AS category_code,
                 r.container_count, r.weight_kg, to_char(r.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
                 r.note, r.qr_code, to_char(r.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
                 uh.full_name AS hospital_decided_by_name, to_char(r.decided_at, 'YYYY-MM-DD HH24:MI') AS decided_at,
                 r.contains_expired,
                 ue.full_name AS efda_decided_by_name, to_char(r.efda_decided_at, 'YYYY-MM-DD HH24:MI') AS efda_decided_at,
                 r.efda_decision_reason,
                 ua.full_name AS assigned_by_name, to_char(r.assigned_at, 'YYYY-MM-DD HH24:MI') AS assigned_at,
                 v.id AS vehicle_id, v.plate_no AS vehicle_plate_no, v.model AS vehicle_model, v.capacity_kg AS vehicle_capacity_kg,
                 df.id AS destination_facility_id, df.name AS destination_name, df.code AS destination_code,
                 df.address AS destination_address, df.city AS destination_city,
                 to_char(r.driver_scanned_at, 'YYYY-MM-DD HH24:MI') AS driver_scanned_at,
                 uo.full_name AS operator_name, to_char(r.operator_scanned_at, 'YYYY-MM-DD HH24:MI') AS operator_scanned_at,
                 to_char(r.disposed_at, 'YYYY-MM-DD HH24:MI') AS disposed_at, r.certificate_no,
                 (SELECT COALESCE(json_agg(json_build_object(
                   'item', l.item,
                   'strength', l.strength,
                   'form', l.form,
                   'batch', l.batch,
                   'quantity', l.quantity,
                   'unit', l.unit,
                   'expiry_date', to_char(l.expiry_date, 'YYYY-MM-DD'),
                   'is_expired', (l.expiry_date <= CURRENT_DATE)
                 ) ORDER BY l.item), '[]'::json)
                  FROM medicine_disposal_request_lines l WHERE l.request_id = r.id) AS lines
          FROM medicine_disposal_requests r
          JOIN facilities f ON f.id = r.facility_id
          JOIN users u ON u.id = r.requested_by
          LEFT JOIN users uh ON uh.id = r.decided_by
          LEFT JOIN users ue ON ue.id = r.efda_decided_by
          LEFT JOIN users ua ON ua.id = r.assigned_by
          LEFT JOIN vehicles v ON v.id = r.vehicle_id
          LEFT JOIN facilities df ON df.id = r.destination_facility_id
          LEFT JOIN users uo ON uo.id = r.operator_id
          WHERE r.driver_id = ${user.id}
            AND r.status IN ('APPROVED', 'RECEIVED_BY_DRIVER', 'RECEIVED_AT_FACILITY', 'DISPOSED')
          ORDER BY (r.status = 'APPROVED') DESC, r.created_at DESC
          LIMIT 50`
    );
  });
}

// ---------------------------------------------------------------- QR & Lifecycle Tracking

/** Driver scans the QR code at the hospital to receive the waste (APPROVED → RECEIVED_BY_DRIVER). */
export async function scanRequestByDriver(qrCode: string, requestId?: string) {
  const driver = await requireRole("driver");
  const trimmed = qrCode.trim();
  if (!trimmed) throw new AppError("VALIDATION_ERROR", 422, "QR code is required.");
  const isUuid = UUID.test(trimmed);

  return inWorkflow(async (tx) => {
    const req = await one<{
      id: string;
      request_code: string;
      status: string;
      facility_id: string;
      facility_name: string;
      qr_code: string | null;
      driver_id: string | null;
    }>(
      tx,
      sql`SELECT r.id, r.request_code, r.status, r.facility_id, f.name AS facility_name, r.qr_code, r.driver_id
          FROM medicine_disposal_requests r
          JOIN facilities f ON f.id = r.facility_id
          WHERE ${isUuid ? sql`r.id = ${trimmed}` : sql`r.qr_code = ${trimmed} OR r.request_code = ${trimmed}`}
          FOR UPDATE OF r`
    );
    if (!req) throw new AppError("NOT_FOUND", 404, "Disposal request not found for this QR code.");

    if (req.status === "PENDING_APPROVAL") {
      throw new AppError(
        "NOT_APPROVED",
        400,
        "This disposal request is still pending Hospital Administrator approval and cannot be collected yet."
      );
    }
    if (req.status === "PENDING_EFDA_APPROVAL") {
      throw new AppError(
        "NOT_APPROVED",
        400,
        "This disposal request contains expired medicine and is pending EFDA approval before driver assignment."
      );
    }
    if (req.status === "PENDING_DRIVER_ASSIGNMENT") {
      throw new AppError(
        "NOT_APPROVED",
        400,
        "This disposal request is pending Super Admin driver assignment."
      );
    }
    if (req.status === "REJECTED") {
      throw new AppError("REJECTED", 400, "This disposal request was rejected.");
    }
    if (req.status === "RECEIVED_BY_DRIVER") {
      throw new AppError(
        "ALREADY_SCANNED",
        409,
        "This waste has already been scanned and received by the driver."
      );
    }
    if (req.status === "RECEIVED_AT_FACILITY" || req.status === "DISPOSED") {
      throw new AppError(
        "ALREADY_DELIVERED",
        409,
        "This waste has already arrived at the disposal facility."
      );
    }
    if (req.status !== "APPROVED") {
      throw new AppError("INVALID_STATUS", 409, `Cannot collect waste with status ${req.status}.`);
    }
    if (req.driver_id && req.driver_id !== driver.id) {
      throw new AppError(
        "FORBIDDEN",
        403,
        "This disposal request is assigned to a different driver."
      );
    }

    const now = new Date();
    await tx.execute(
      sql`UPDATE medicine_disposal_requests
          SET status = 'RECEIVED_BY_DRIVER',
              driver_id = ${driver.id},
              driver_scanned_at = ${now}
          WHERE id = ${req.id}`
    );

    // Notify Super Admin
    const superAdmins = await all<{ email: string }>(
      tx,
      sql`SELECT email FROM users WHERE role = 'super_admin' AND active AND email IS NOT NULL LIMIT 20`
    );
    for (const a of superAdmins) {
      await enqueueMessage(tx, {
        template: "disposal.driver_scanned",
        recipient: a.email,
        data: {
          requestCode: req.request_code,
          facilityName: req.facility_name,
          driverName: driver.fullName ?? "Assigned Driver",
          scannedAt: toEatDateString(now),
        },
      });
    }

    await writeAudit(tx, {
      actor: actorOf(driver),
      action: "medicine_request.driver_scanned",
      entityType: "medicine_request",
      entityId: req.id,
      after: {
        status: "RECEIVED_BY_DRIVER",
        driverId: driver.id,
        driverScannedAt: now,
      },
      requestId,
    });

    return {
      id: req.id,
      requestCode: req.request_code,
      status: "RECEIVED_BY_DRIVER" as const,
      message: `Waste request ${req.request_code} successfully scanned and marked as Received by Driver.`,
    };
  });
}

/** Disposal operator scans the QR code when waste arrives at disposal facility (RECEIVED_BY_DRIVER → RECEIVED_AT_FACILITY). */
export async function scanRequestByOperator(qrCode: string, requestId?: string) {
  const operator = await requireRole("disposal_operator");
  const trimmed = qrCode.trim();
  if (!trimmed) throw new AppError("VALIDATION_ERROR", 422, "QR code is required.");
  const isUuid = UUID.test(trimmed);

  return inWorkflow(async (tx) => {
    const req = await one<{
      id: string;
      request_code: string;
      status: string;
      facility_id: string;
      facility_name: string;
      qr_code: string | null;
      driver_id: string | null;
    }>(
      tx,
      sql`SELECT r.id, r.request_code, r.status, r.facility_id, f.name AS facility_name, r.qr_code, r.driver_id
          FROM medicine_disposal_requests r
          JOIN facilities f ON f.id = r.facility_id
          WHERE ${isUuid ? sql`r.id = ${trimmed}` : sql`r.qr_code = ${trimmed} OR r.request_code = ${trimmed}`}
          FOR UPDATE OF r`
    );
    if (!req) throw new AppError("NOT_FOUND", 404, "Disposal request not found for this QR code.");

    if (
      req.status === "PENDING_APPROVAL" ||
      req.status === "PENDING_EFDA_APPROVAL" ||
      req.status === "PENDING_DRIVER_ASSIGNMENT" ||
      req.status === "APPROVED"
    ) {
      throw new AppError(
        "NOT_COLLECTED",
        400,
        "This request has not been collected and scanned by a driver yet."
      );
    }
    if (req.status === "RECEIVED_AT_FACILITY") {
      throw new AppError(
        "ALREADY_SCANNED",
        409,
        "This waste has already been received at the disposal facility."
      );
    }
    if (req.status === "DISPOSED") {
      throw new AppError("ALREADY_DISPOSED", 409, "This waste has already been disposed.");
    }
    if (req.status !== "RECEIVED_BY_DRIVER") {
      throw new AppError("INVALID_STATUS", 409, `Cannot receive waste with status ${req.status}.`);
    }

    const now = new Date();
    await tx.execute(
      sql`UPDATE medicine_disposal_requests
          SET status = 'RECEIVED_AT_FACILITY',
              operator_id = ${operator.id},
              operator_scanned_at = ${now}
          WHERE id = ${req.id}`
    );

    await writeAudit(tx, {
      actor: actorOf(operator),
      action: "medicine_request.operator_scanned",
      entityType: "medicine_request",
      entityId: req.id,
      after: {
        status: "RECEIVED_AT_FACILITY",
        operatorId: operator.id,
        operatorScannedAt: now,
      },
      requestId,
    });

    return {
      id: req.id,
      requestCode: req.request_code,
      status: "RECEIVED_AT_FACILITY" as const,
      message: `Waste request ${req.request_code} successfully verified and marked as Received at Disposal Facility.`,
    };
  });
}

/** Disposal operator completes destruction and issues certificate (RECEIVED_AT_FACILITY → DISPOSED). */
export async function markDisposalComplete(idOrCode: string, requestId?: string) {
  const operator = await requireRole("disposal_operator");
  const trimmed = idOrCode.trim();
  if (!trimmed) throw new AppError("VALIDATION_ERROR", 422, "ID or QR code is required.");
  const isUuid = UUID.test(trimmed);

  return inWorkflow(async (tx) => {
    const req = await one<{
      id: string;
      request_code: string;
      status: string;
      facility_id: string;
      facility_code: string;
      facility_name: string;
      weight_kg: string;
      container_count: number;
      waste_code: string | null;
    }>(
      tx,
      sql`SELECT r.id, r.request_code, r.status, r.facility_id, f.code AS facility_code, f.name AS facility_name,
                 r.weight_kg, r.container_count, w.waste_code
          FROM medicine_disposal_requests r
          JOIN facilities f ON f.id = r.facility_id
          LEFT JOIN waste_records w ON w.id = r.waste_record_id
          WHERE ${isUuid ? sql`r.id = ${trimmed}` : sql`r.qr_code = ${trimmed} OR r.request_code = ${trimmed}`}
          FOR UPDATE OF r`
    );
    if (!req) throw new AppError("NOT_FOUND", 404, "Disposal request not found.");

    if (req.status !== "RECEIVED_AT_FACILITY") {
      throw new AppError(
        "INVALID_STATUS",
        400,
        `Cannot mark as disposed. The request must be in 'Received at Disposal Facility' status (current: ${req.status}).`
      );
    }

    const lines = await all<{
      item: string;
      strength: string;
      batch: string;
      quantity: number;
      unit: string;
    }>(
      tx,
      sql`SELECT item, strength, batch, quantity, unit
          FROM medicine_disposal_request_lines WHERE request_id = ${req.id} ORDER BY item`
    );

    const certificateNo = await nextCode(tx, "certificate");
    const now = new Date();
    const systemName = await getSetting("system_name", tx);

    const pdf = await renderCertificatePdf({
      systemName,
      certificateNo,
      issuedOn: toEatDateString(now),
      facilityName: req.facility_name,
      facilityCode: req.facility_code,
      wasteCode: req.waste_code ?? req.request_code,
      categoryName: "PHARMACEUTICAL / EXPIRED MEDICINE",
      weightKg: Number(req.weight_kg),
      destroyedOn: toEatDateString(now),
      methodName: "High Temperature Incineration / Safe Disposal",
      verifyUrl: `${env.APP_BASE_URL.replace(/\/$/, "")}/verify/disposal/${req.id}`,
      destroyed: lines.map(
        (l) => `${l.item}${l.strength ? ` ${l.strength}` : ""} - ${l.quantity} ${l.unit} [Batch: ${l.batch}]`
      ),
      exceptions: [],
    });

    const fileKey = `disposal-certificates/${certificateNo.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
    await getStorage().put(fileKey, pdf, "application/pdf");

    await tx.execute(
      sql`UPDATE medicine_disposal_requests
          SET status = 'DISPOSED',
              disposed_at = ${now},
              certificate_no = ${certificateNo},
              certificate_issued_at = ${now},
              certificate_pdf_key = ${fileKey}
          WHERE id = ${req.id}`
    );

    // Send email notification with certificate details to Hospital Admin, Staff, EFDA, Super Admin
    const recipients = await all<{ email: string }>(
      tx,
      sql`SELECT DISTINCT email FROM users WHERE (
            (facility_id = ${req.facility_id} AND role IN ('hospital_admin', 'hospital_staff'))
            OR role IN ('efda_officer', 'super_admin')
          ) AND active AND email IS NOT NULL LIMIT 50`
    );
    for (const r of recipients) {
      await enqueueMessage(tx, {
        template: "certificate.issued",
        recipient: r.email,
        data: {
          certificateNo,
          wasteCode: req.waste_code ?? req.request_code,
          facilityName: req.facility_name,
          verifyUrl: `${env.APP_BASE_URL.replace(/\/$/, "")}/verify/disposal/${req.id}`,
        },
      });
    }

    await writeAudit(tx, {
      actor: actorOf(operator),
      action: "medicine_request.disposed",
      entityType: "medicine_request",
      entityId: req.id,
      after: {
        status: "DISPOSED",
        disposedAt: now,
        certificateNo,
        certificatePdfKey: fileKey,
      },
      requestId,
    });

    return {
      id: req.id,
      requestCode: req.request_code,
      status: "DISPOSED" as const,
      certificateNo,
      certificatePdfKey: fileKey,
      message: `Disposal completed successfully. Certificate ${certificateNo} generated and emailed.`,
    };
  });
}

/** Detailed request information for drivers, operators, or administrators to verify waste. */
export async function getRequestVerificationDetails(qrCodeOrId: string) {
  const user = await requireRole(
    "driver",
    "disposal_operator",
    "super_admin",
    "efda_officer",
    "hospital_admin",
    "hospital_staff"
  );
  const trimmed = qrCodeOrId.trim();
  if (!trimmed) throw new AppError("VALIDATION_ERROR", 422, "QR code or ID is required.");
  const isUuid = UUID.test(trimmed);

  return inWorkflow(async (tx) => {
    const req = await one<{
      id: string;
      request_code: string;
      facility_id: string;
      facility_code: string;
      facility_name: string;
      facility_address: string;
      facility_city: string | null;
      facility_sub_city: string | null;
      facility_woreda: string | null;
      facility_region: string;
      facility_lat: number;
      facility_lng: number;
      requested_by_name: string;
      requester_email: string | null;
      requester_phone: string | null;
      status: string;
      created_at: Date;
      container_count: number;
      weight_kg: string;
      scheduled_date: string | null;
      note: string | null;
      qr_code: string | null;
      driver_id: string | null;
      driver_name: string | null;
      driver_scanned_at: Date | null;
      vehicle_plate_no: string | null;
      vehicle_model: string | null;
      destination_name: string | null;
      destination_code: string | null;
      destination_address: string | null;
      destination_city: string | null;
      hospital_decided_by_name: string | null;
      decided_at: Date | null;
      contains_expired: boolean;
      efda_decided_by_name: string | null;
      efda_decided_at: Date | null;
      efda_decision_reason: string | null;
      assigned_by_name: string | null;
      assigned_at: Date | null;
      operator_name: string | null;
      operator_scanned_at: Date | null;
      disposed_at: Date | null;
      certificate_no: string | null;
    }>(
      tx,
      sql`SELECT r.id, r.request_code, f.id AS facility_id, f.code AS facility_code, f.name AS facility_name,
                 f.address AS facility_address, f.city AS facility_city, f.sub_city AS facility_sub_city,
                 f.woreda AS facility_woreda, f.region AS facility_region, f.lat AS facility_lat, f.lng AS facility_lng,
                 u.full_name AS requested_by_name, u.email AS requester_email, u.phone AS requester_phone,
                 r.status, r.created_at, r.container_count, r.weight_kg,
                 to_char(r.scheduled_date, 'YYYY-MM-DD') AS scheduled_date, r.note, r.qr_code,
                 r.driver_id, ud.full_name AS driver_name, r.driver_scanned_at,
                 v.plate_no AS vehicle_plate_no, v.model AS vehicle_model,
                 df.name AS destination_name, df.code AS destination_code, df.address AS destination_address, df.city AS destination_city,
                 uh.full_name AS hospital_decided_by_name, r.decided_at, r.contains_expired,
                 ue.full_name AS efda_decided_by_name, r.efda_decided_at, r.efda_decision_reason,
                 ua.full_name AS assigned_by_name, r.assigned_at,
                 uo.full_name AS operator_name, r.operator_scanned_at,
                 r.disposed_at, r.certificate_no
          FROM medicine_disposal_requests r
          JOIN facilities f ON f.id = r.facility_id
          JOIN users u ON u.id = r.requested_by
          LEFT JOIN users ud ON ud.id = r.driver_id
          LEFT JOIN users uh ON uh.id = r.decided_by
          LEFT JOIN users ue ON ue.id = r.efda_decided_by
          LEFT JOIN users ua ON ua.id = r.assigned_by
          LEFT JOIN vehicles v ON v.id = r.vehicle_id
          LEFT JOIN facilities df ON df.id = r.destination_facility_id
          LEFT JOIN users uo ON uo.id = r.operator_id
          WHERE ${isUuid ? sql`r.id = ${trimmed}` : sql`r.qr_code = ${trimmed} OR r.request_code = ${trimmed}`}
          LIMIT 1`
    );
    if (!req) throw new AppError("NOT_FOUND", 404, "Disposal request not found for this QR code.");
    if (
      (user.role === "hospital_admin" || user.role === "hospital_staff") &&
      user.facilityId !== req.facility_id
    ) {
      throw new AppError("FORBIDDEN", 403, "You can only view requests from your own facility.");
    }
    if (user.role === "driver" && req.driver_id && req.driver_id !== user.id) {
      throw new AppError("FORBIDDEN", 403, "This disposal request is assigned to a different driver.");
    }
    const lines = await all<{
      item: string;
      strength: string;
      form: string;
      batch: string;
      quantity: number;
      unit: string;
      expiry_date: string;
      is_expired: boolean;
    }>(
      tx,
      sql`SELECT item, strength, form, batch, quantity, unit, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date,
                 (expiry_date <= CURRENT_DATE) AS is_expired
          FROM medicine_disposal_request_lines WHERE request_id = ${req.id} ORDER BY item`
    );
    return {
      id: req.id,
      requestCode: req.request_code,
      qrCode: req.qr_code ?? `QR-${req.request_code}`,
      facility: {
        id: req.facility_id,
        code: req.facility_code,
        name: req.facility_name,
        address: req.facility_address,
        city: req.facility_city,
        subCity: req.facility_sub_city,
        woreda: req.facility_woreda,
        region: req.facility_region,
        lat: req.facility_lat,
        lng: req.facility_lng,
      },
      requester: {
        name: req.requested_by_name,
        email: req.requester_email,
        phone: req.requester_phone,
      },
      category: {
        name: "Pharmaceutical Waste",
        code: "PHARMACEUTICAL",
        description: "Pharmaceutical waste requiring specialized tracking and destruction.",
      },
      status: req.status,
      requestedBy: req.requested_by_name,
      createdAt: new Date(req.created_at).toISOString(),
      containerCount: Number(req.container_count),
      weightKg: Number(req.weight_kg),
      scheduledDate: req.scheduled_date,
      note: req.note,
      vehicle: req.vehicle_plate_no
        ? {
            plateNo: req.vehicle_plate_no,
            model: req.vehicle_model,
          }
        : null,
      destination: req.destination_name
        ? {
            name: req.destination_name,
            code: req.destination_code,
            address: req.destination_address,
            city: req.destination_city,
          }
        : null,
      approvalHistory: {
        hospitalApprovedBy: req.hospital_decided_by_name,
        hospitalApprovedAt: req.decided_at ? new Date(req.decided_at).toISOString() : null,
        containsExpired: req.contains_expired,
        efdaApprovedBy: req.efda_decided_by_name,
        efdaApprovedAt: req.efda_decided_at ? new Date(req.efda_decided_at).toISOString() : null,
        efdaDecisionReason: req.efda_decision_reason,
        assignedBy: req.assigned_by_name,
        assignedAt: req.assigned_at ? new Date(req.assigned_at).toISOString() : null,
      },
      driverName: req.driver_name,
      driverScannedAt: req.driver_scanned_at ? new Date(req.driver_scanned_at).toISOString() : null,
      operatorName: req.operator_name,
      operatorScannedAt: req.operator_scanned_at
        ? new Date(req.operator_scanned_at).toISOString()
        : null,
      disposedAt: req.disposed_at ? new Date(req.disposed_at).toISOString() : null,
      certificateNo: req.certificate_no,
      lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity) })),
    };
  });
}

/** Signed-in download of disposal certificate PDF. */
export async function downloadDisposalCertificate(
  id: string,
  requestId?: string
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const user = await requireRole(
    "super_admin",
    "efda_officer",
    "hospital_admin",
    "hospital_staff",
    "disposal_operator"
  );
  if (!UUID.test(id)) throw new AppError("NOT_FOUND", 404, "Disposal request not found.");
  const scope =
    user.role === "hospital_admin" || user.role === "hospital_staff"
      ? sql`AND r.facility_id = ${user.facilityId}`
      : sql``;
  return inWorkflow(async (tx) => {
    const r = await one<{
      id: string;
      certificate_no: string | null;
      certificate_pdf_key: string | null;
      status: string;
      facility_id: string;
    }>(
      tx,
      sql`SELECT r.id, r.certificate_no, r.certificate_pdf_key, r.status, r.facility_id
          FROM medicine_disposal_requests r
          WHERE r.id = ${id} ${scope}`
    );
    if (!r || !r.certificate_pdf_key) {
      throw new AppError("NOT_FOUND", 404, "Certificate not found for this request.");
    }
    const bytes = await getStorage().get(r.certificate_pdf_key);
    if (!bytes) {
      throw new AppError("FILE_MISSING", 404, "The certificate file is not available.");
    }
    await writeAudit(tx, {
      actor: { userId: user.id, role: user.role },
      action: "medicine_disposal_certificate.downloaded",
      entityType: "medicine_request",
      entityId: r.id,
      after: { certificateNo: r.certificate_no },
      requestId,
    });
    return {
      fileName: `Disposal-Certificate-${r.certificate_no ?? r.id}.pdf`,
      bytes,
    };
  });
}

/** Returns a base64 PNG data URL of the given QR text. */
export async function getQrCodeDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 320,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
