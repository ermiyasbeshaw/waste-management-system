import "server-only";
import { sql } from "drizzle-orm";
import { toEatDateString } from "@/lib/dates";
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
import { readXlsxTable } from "@/server/integrations/xlsx";
import { enqueueMessage } from "@/server/outbox/enqueue";
import { inWorkflow, transition } from "@/server/workflow/engine";
import { friendlyDbError, invalid } from "./_errors";
import { getSetting } from "./settings";
import { registerWasteTx } from "./waste";

/**
 * Medicine stock and expiry (CLAUDE.md §12, modules 21–22, Gate 8). Writes:
 * - hospital_admin / hospital_staff: their OWN facility's stock (import, add, edit, archive) and disposal requests;
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

// ---------------------------------------------------------------- 8.2 stock import

/** Reads an uploaded CSV / XLSX file and returns the rows with their errors. Nothing is saved. */
export async function previewStockFile(file: {
  name: string;
  bytes: Uint8Array;
}): Promise<ImportPreview> {
  await hospitalUser();
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
  const user = await hospitalUser();
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
  const user = await hospitalUser();
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
  const user = await hospitalUser();
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
  const user = await hospitalUser();
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
 * that got a new alert (facility hospital_admin users + every efda_officer). No SMS.
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
      const admins = await all<{ email: string }>(
        tx,
        sql`SELECT email FROM users WHERE facility_id = ${facilityId} AND role = 'hospital_admin'
              AND active AND email IS NOT NULL LIMIT 20`
      );
      const recipients = Array.from(
        new Set([...admins, ...efda].map((r) => r.email.toLowerCase()))
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
 * The facility's hospital admin asks to dispose of stock lines of their own facility → PENDING_APPROVAL (code
 * MD-YYYY-NNNNN). Owner decision (11 Oct 2026): ONLY the hospital_admin creates requests; staff upload stock and
 * see the requests. Quantities are checked again when the EFDA officer approves (no reservation in between).
 */
export async function createDisposalRequest(
  raw: unknown,
  meta: { idempotencyKey: string | null | undefined; requestId?: string }
) {
  const admin = await requireRole("hospital_admin");
  if (!admin.facilityId) {
    throw new AppError("FORBIDDEN", 403, "Your account is not linked to a facility.");
  }
  const user = admin as ActiveUser & { facilityId: string };
  const parsed = disposalRequestSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const input = parsed.data;
  return inWorkflow(async (tx) => {
    const result = await withIdempotency(
      tx,
      { key: meta.idempotencyKey, userId: user.id, route: CREATE_REQUEST_ROUTE, request: input },
      async () => {
        const ids = input.lines.map((l) => l.stockId);
        const stock = await all<StockRowDb>(
          tx,
          sql`SELECT ${STOCK_COLS} FROM medicine_stock
              WHERE facility_id = ${user.facilityId} AND id IN (${sql.join(
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
        const req = (await one<{ id: string }>(
          tx,
          sql`INSERT INTO medicine_disposal_requests (request_code, facility_id, requested_by, note, container_count, weight_kg, scheduled_date)
              VALUES (${requestCode}, ${user.facilityId}, ${user.id}, ${input.note}, ${input.containerCount},
                      ${input.weightKg.toFixed(2)}, ${input.scheduledDate ? sql`${input.scheduledDate}::date` : null})
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
          actor: actorOf(user),
          action: "medicine_request.created",
          entityType: "medicine_request",
          entityId: req.id,
          after: {
            requestCode,
            status: "PENDING_APPROVAL",
            lines: input.lines.length,
            containerCount: input.containerCount,
            weightKg: input.weightKg,
            scheduledDate: input.scheduledDate,
          },
          requestId: meta.requestId,
        });
        return { status: 201, body: { id: req.id, requestCode } };
      }
    );
    return result.body;
  });
}

/**
 * EFDA decision (CLAUDE.md §12): only efda_officer, through the Workflow Engine. APPROVE (one transaction): the stock
 * is reduced, a PHARMACEUTICAL waste record (REGISTERED, containers LABELLED) is registered for the facility in the
 * requester's name, and the request is linked to it. REJECT needs a reason.
 */
export async function decideDisposalRequest(id: string, raw: unknown, requestId?: string) {
  const officer = await requireRole("efda_officer");
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
      requester_id: string;
      requester_role: Role | null;
      requester_facility: string | null;
      requester_active: boolean;
    }>(
      tx,
      sql`SELECT r.id, r.request_code, r.status, r.facility_id, r.container_count, r.weight_kg,
                 u.id AS requester_id, u.role AS requester_role, u.facility_id AS requester_facility,
                 u.active AS requester_active
          FROM medicine_disposal_requests r JOIN users u ON u.id = r.requested_by
          WHERE r.id = ${id} FOR UPDATE OF r`
    );
    if (!req) throw new AppError("NOT_FOUND", 404, "Request not found.");
    const decided = { decidedBy: officer.id, decidedAt: new Date() };

    if (parsed.data.decision === "REJECT") {
      await transition(tx, {
        entity: "medicine_request",
        id,
        to: "REJECTED",
        actor: officer,
        reason: parsed.data.reason,
        set: decided,
        requestId,
      });
      return { requestCode: req.request_code, status: "REJECTED" as const, wasteCode: null };
    }

    if (req.status !== "PENDING_APPROVAL") {
      // Let the engine give the standard 409 for a request that is already decided.
      await transition(tx, {
        entity: "medicine_request",
        id,
        to: "APPROVED",
        actor: officer,
        set: decided,
        requestId,
      });
    }
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
      actor: actorOf(officer),
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

    // The waste record is registered for the facility in the requester's name (hospital role, same facility).
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
    await transition(tx, {
      entity: "medicine_request",
      id,
      to: "APPROVED",
      actor: officer,
      set: { ...decided, wasteRecordId: waste.id },
      requestId,
    });
    return {
      requestCode: req.request_code,
      status: "APPROVED" as const,
      wasteCode: waste.wasteCode,
    };
  });
}
