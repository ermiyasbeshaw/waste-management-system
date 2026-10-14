import "server-only";
import { sql } from "drizzle-orm";
import {
  contractStatusOn,
  dueDate,
  invoiceAmounts,
  isBillableMonth,
  monthPeriod,
  previousMonth,
} from "@/lib/billing";
import { toEatDateString } from "@/lib/dates";
import { formatEtb } from "@/lib/money";
import {
  cancelInvoiceSchema,
  contractSchema,
  contractUpdateSchema,
  invoiceMonthSchema,
  settleSchema,
} from "@/lib/validation/billing";
import { writeAudit } from "@/server/audit/writer";
import type { ActiveUser } from "@/server/auth/access-rules";
import { requireRole } from "@/server/auth/current-user";
import { nextCode } from "@/server/db/codes";
import type { DbExecutor } from "@/server/db/executor";
import { contracts, invoices } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { purgeExpiredIdempotencyKeys } from "@/server/idempotency/store";
import { renderInvoicePdf } from "@/server/integrations/pdf/invoice";
import { enqueueMessage } from "@/server/outbox/enqueue";
import { inWorkflow, transition } from "@/server/workflow/engine";
import type { Actor } from "@/server/workflow/table";
import { friendlyDbError, invalid } from "./_errors";
import { processCertificateQueue } from "./certificates";
import { computeStockExpiryAlerts } from "./medicine";
import { getSetting } from "./settings";

/**
 * Billing (CLAUDE.md §5–§6, Gate 6.1–6.3). Only super_admin writes; hospital_admin reads its own facility's issued
 * invoices. Money in santim; the VAT rate is copied onto each invoice when it is created, the due date is stored
 * when it is issued, so later setting changes never alter old invoices. No payment gateway: settlement is recorded
 * offline with a reference. "Overdue" is derived (ISSUED and past the due date), never a status.
 */

const one = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows[0] as T | undefined;
const all = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows as T[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const today = () => toEatDateString(new Date());
const actorOf = (u: ActiveUser | null) => (u ? { userId: u.id, role: u.role } : null);
const monthLabel = (periodStart: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${periodStart}T12:00:00Z`)
  );

// ---------------------------------------------------------------- 6.1 contracts

/** New contract (code CT-YYYY-NNNN). Contracts of one facility may not overlap (database constraint). */
export async function createContract(raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = contractSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const c = parsed.data;
  if (c.endDate <= today()) {
    throw new AppError("VALIDATION_ERROR", 422, "The contract must end in the future.", {
      fields: { endDate: ["Must be after today"] },
    });
  }
  return inWorkflow(async (tx) => {
    const facility = await one<{ id: string; type: string }>(
      tx,
      sql`SELECT id, type FROM facilities WHERE code = ${c.facilityCode}`
    );
    if (!facility || facility.type === "DISPOSAL_SITE") {
      throw new AppError("VALIDATION_ERROR", 422, "Choose a health facility.", {
        fields: { facilityCode: ["Unknown health facility"] },
      });
    }
    const contractCode = await nextCode(tx, "contract", new Date(`${c.startDate}T12:00:00Z`));
    const [row] = await tx
      .insert(contracts)
      .values({
        contractCode,
        facilityId: facility.id,
        startDate: c.startDate,
        endDate: c.endDate,
        monthlyFeeSantim: c.monthlyFeeEtb,
        terms: c.terms,
      })
      .returning({ id: contracts.id })
      .catch(friendlyDbError);
    await writeAudit(tx, {
      actor: actorOf(admin),
      action: "contract.created",
      entityType: "contract",
      entityId: row.id,
      after: {
        contractCode,
        facilityCode: c.facilityCode,
        startDate: c.startDate,
        endDate: c.endDate,
        monthlyFeeSantim: c.monthlyFeeEtb,
      },
      requestId,
    });
    const warningDays = await getSetting("contract_expiry_warning_days", tx);
    if (contractStatusOn(today(), c.endDate, warningDays) === "EXPIRING_SOON") {
      await transition(tx, {
        entity: "contract",
        id: row.id,
        to: "EXPIRING_SOON",
        actor: null,
        requestId,
      });
    }
    return { id: row.id, contractCode };
  });
}

/**
 * Change a running contract: end date, fee (applies to invoices created from now on) and terms.
 * ASSUMPTION: a renewal that would move the status back (EXPIRING_SOON → ACTIVE) is a NEW contract.
 */
export async function updateContract(contractId: string, raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = contractUpdateSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  if (!UUID.test(contractId)) throw new AppError("NOT_FOUND", 404, "Contract not found.");
  const u = parsed.data;
  return inWorkflow(async (tx) => {
    const c = await one<{
      id: string;
      contract_code: string;
      status: string;
      start_date: string;
      end_date: string;
      monthly_fee_santim: string;
      terms: string | null;
    }>(
      tx,
      sql`SELECT id, contract_code, status, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                 to_char(end_date, 'YYYY-MM-DD') AS end_date, monthly_fee_santim, terms
          FROM contracts WHERE id = ${contractId} FOR UPDATE`
    );
    if (!c) throw new AppError("NOT_FOUND", 404, "Contract not found.");
    if (c.status === "EXPIRED") {
      throw new AppError(
        "CONTRACT_EXPIRED",
        409,
        "An expired contract cannot change. Create a new one."
      );
    }
    if (u.endDate <= c.start_date || u.endDate <= today()) {
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "The end date must be after the start date and today.",
        {
          fields: { endDate: ["Must be after the start date and today"] },
        }
      );
    }
    const warningDays = await getSetting("contract_expiry_warning_days", tx);
    const next = contractStatusOn(today(), u.endDate, warningDays);
    if (c.status === "EXPIRING_SOON" && next === "ACTIVE") {
      throw new AppError(
        "RENEWAL_IS_NEW_CONTRACT",
        409,
        "To renew, create a new contract that starts when this one ends."
      );
    }
    await tx
      .update(contracts)
      .set({ endDate: u.endDate, monthlyFeeSantim: u.monthlyFeeEtb, terms: u.terms })
      .where(sql`${contracts.id} = ${contractId}`)
      .catch(friendlyDbError);
    await writeAudit(tx, {
      actor: actorOf(admin),
      action: "contract.updated",
      entityType: "contract",
      entityId: contractId,
      before: {
        endDate: c.end_date,
        monthlyFeeSantim: Number(c.monthly_fee_santim),
        terms: c.terms,
      },
      after: { endDate: u.endDate, monthlyFeeSantim: u.monthlyFeeEtb, terms: u.terms },
      requestId,
    });
    if (c.status === "ACTIVE" && next === "EXPIRING_SOON") {
      await transition(tx, {
        entity: "contract",
        id: contractId,
        to: "EXPIRING_SOON",
        actor: null,
        requestId,
      });
    }
    return {
      id: contractId,
      contractCode: c.contract_code,
      status: c.status === "ACTIVE" ? next : c.status,
    };
  });
}

// ---------------------------------------------------------------- 6.2 monthly invoices

/**
 * DRAFT invoices for `month` from every running contract (ACTIVE / EXPIRING_SOON) whose month is billable.
 * Safe to run twice: one invoice per (contract, month) — checked under a lock on the contract, and unique in the
 * database. `actor` null = the scheduled job.
 */
export async function generateMonthlyInvoices(
  month: string,
  actor: ActiveUser | null,
  requestId?: string
): Promise<{ month: string; created: number; skipped: number }> {
  const { periodStart, periodEnd } = monthPeriod(month);
  return inWorkflow(async (tx) => {
    const vatRate = await getSetting("vat_rate_percent", tx);
    const list = await all<{
      id: string;
      facility_id: string;
      start_date: string;
      end_date: string;
      monthly_fee_santim: string;
    }>(
      tx,
      sql`SELECT id, facility_id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                 to_char(end_date, 'YYYY-MM-DD') AS end_date, monthly_fee_santim
          FROM contracts
          WHERE status IN ('ACTIVE', 'EXPIRING_SOON') AND start_date <= ${periodStart}::date
            AND end_date > ${periodStart}::date
          ORDER BY contract_code
          FOR UPDATE`
    );
    let created = 0;
    let skipped = 0;
    for (const c of list) {
      if (!isBillableMonth(month, c.start_date, c.end_date)) continue;
      const exists = await one<{ id: string }>(
        tx,
        sql`SELECT id FROM invoices WHERE contract_id = ${c.id} AND period_start = ${periodStart}::date`
      );
      if (exists) {
        skipped++;
        continue;
      }
      const amounts = invoiceAmounts(Number(c.monthly_fee_santim), vatRate);
      const invoiceNo = await nextCode(tx, "invoice", new Date(`${periodStart}T12:00:00Z`));
      const [row] = await tx
        .insert(invoices)
        .values({
          invoiceNo,
          contractId: c.id,
          facilityId: c.facility_id,
          periodStart,
          periodEnd,
          subtotalSantim: amounts.subtotalSantim,
          vatRatePercent: String(vatRate),
          vatSantim: amounts.vatSantim,
          totalSantim: amounts.totalSantim,
        })
        .returning({ id: invoices.id });
      await writeAudit(tx, {
        actor: actorOf(actor),
        action: "invoice.created",
        entityType: "invoice",
        entityId: row.id,
        after: {
          invoiceNo,
          periodStart,
          totalSantim: amounts.totalSantim,
          vatRatePercent: vatRate,
        },
        requestId,
      });
      created++;
    }
    return { month, created, skipped };
  });
}

/** super_admin creates the drafts of a month now (default: the previous month). */
export async function runMonthlyInvoicesNow(raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const given = (raw as { month?: unknown } | null)?.month;
  let month = previousMonth(today());
  if (given !== undefined && given !== "") {
    const parsed = invoiceMonthSchema.safeParse({ month: given });
    if (!parsed.success) throw invalid(parsed.error);
    month = parsed.data.month;
  }
  return generateMonthlyInvoices(month, admin, requestId);
}

// ---------------------------------------------------------------- 6.3 issue / settle / cancel

type InvoiceMail = {
  invoice_no: string;
  facility_id: string;
  facility_name: string;
  period_start: string;
  total_santim: string;
};

export async function issueInvoice(invoiceId: string, requestId?: string) {
  const admin = await requireRole("super_admin");
  if (!UUID.test(invoiceId)) throw new AppError("NOT_FOUND", 404, "Invoice not found.");
  return inWorkflow(async (tx) => {
    const days = await getSetting("invoice_due_days", tx);
    const due = dueDate(today(), days);
    await transition(tx, {
      entity: "invoice",
      id: invoiceId,
      to: "ISSUED",
      actor: admin,
      set: { issuedAt: new Date(), dueDate: due },
      requestId,
    });
    const inv = (await one<InvoiceMail>(
      tx,
      sql`SELECT i.invoice_no, i.facility_id, f.name AS facility_name,
                 to_char(i.period_start, 'YYYY-MM-DD') AS period_start, i.total_santim
          FROM invoices i JOIN facilities f ON f.id = i.facility_id WHERE i.id = ${invoiceId}`
    ))!;
    const recipients = await all<{ email: string }>(
      tx,
      sql`SELECT email FROM users WHERE facility_id = ${inv.facility_id} AND role = 'hospital_admin'
            AND active AND email IS NOT NULL LIMIT 20`
    );
    for (const r of recipients) {
      await enqueueMessage(tx, {
        template: "invoice.issued",
        recipient: r.email,
        data: {
          invoiceNo: inv.invoice_no,
          facilityName: inv.facility_name,
          periodLabel: monthLabel(inv.period_start),
          total: formatEtb(Number(inv.total_santim)),
          dueDate: due,
        },
      });
    }
    return { invoiceNo: inv.invoice_no, status: "ISSUED", dueDate: due };
  });
}

/** Payment recorded offline (no gateway): reference + date. */
export async function settleInvoice(invoiceId: string, raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = settleSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  if (!UUID.test(invoiceId)) throw new AppError("NOT_FOUND", 404, "Invoice not found.");
  if (parsed.data.settledOn > today()) {
    throw new AppError("VALIDATION_ERROR", 422, "The payment date cannot be in the future.", {
      fields: { settledOn: ["Not in the future"] },
    });
  }
  return inWorkflow(async (tx) => {
    const { row } = await transition(tx, {
      entity: "invoice",
      id: invoiceId,
      to: "SETTLED_OFFLINE",
      actor: admin,
      set: {
        settledAt: new Date(`${parsed.data.settledOn}T12:00:00+03:00`),
        settlementRef: parsed.data.reference,
      },
      requestId,
    });
    return { invoiceNo: row.invoice_no as string, status: "SETTLED_OFFLINE" };
  });
}

export async function cancelInvoice(invoiceId: string, raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = cancelInvoiceSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  if (!UUID.test(invoiceId)) throw new AppError("NOT_FOUND", 404, "Invoice not found.");
  return inWorkflow(async (tx) => {
    const { row } = await transition(tx, {
      entity: "invoice",
      id: invoiceId,
      to: "CANCELLED",
      actor: admin,
      reason: parsed.data.reason,
      requestId,
    });
    return { invoiceNo: row.invoice_no as string, status: "CANCELLED" };
  });
}

/** Invoice PDF: super_admin any invoice; hospital_admin its own facility's issued ones (never drafts). Audited. */
export async function invoicePdf(invoiceId: string, requestId?: string) {
  const user = await requireRole("super_admin", "hospital_admin");
  if (!UUID.test(invoiceId)) throw new AppError("NOT_FOUND", 404, "Invoice not found.");
  const scope =
    user.role === "hospital_admin"
      ? sql`AND i.facility_id = ${user.facilityId} AND i.status <> 'DRAFT'`
      : sql``;
  return inWorkflow(async (tx) => {
    const inv = await one<{
      id: string;
      invoice_no: string;
      status: "DRAFT" | "ISSUED" | "SETTLED_OFFLINE" | "CANCELLED";
      facility_name: string;
      facility_code: string;
      contract_code: string;
      period_start: string;
      period_end: string;
      issued_at: Date | null;
      due_date: string | null;
      subtotal_santim: string;
      vat_rate_percent: string;
      vat_santim: string;
      total_santim: string;
      settled_at: Date | null;
      settlement_ref: string | null;
    }>(
      tx,
      sql`SELECT i.id, i.invoice_no, i.status, f.name AS facility_name, f.code AS facility_code, c.contract_code,
                 to_char(i.period_start, 'YYYY-MM-DD') AS period_start, to_char(i.period_end, 'YYYY-MM-DD') AS period_end,
                 i.issued_at, to_char(i.due_date, 'YYYY-MM-DD') AS due_date, i.subtotal_santim, i.vat_rate_percent,
                 i.vat_santim, i.total_santim, i.settled_at, i.settlement_ref
          FROM invoices i JOIN facilities f ON f.id = i.facility_id JOIN contracts c ON c.id = i.contract_id
          WHERE i.id = ${invoiceId} ${scope}`
    );
    if (!inv) throw new AppError("NOT_FOUND", 404, "Invoice not found.");
    const bytes = await renderInvoicePdf({
      systemName: await getSetting("system_name", tx),
      invoiceNo: inv.invoice_no,
      status: inv.status,
      facilityName: inv.facility_name,
      facilityCode: inv.facility_code,
      contractCode: inv.contract_code,
      periodLabel: monthLabel(inv.period_start),
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      issuedOn: inv.issued_at ? toEatDateString(inv.issued_at) : null,
      dueDate: inv.due_date,
      subtotal: formatEtb(Number(inv.subtotal_santim)),
      vatRatePercent: String(Number(inv.vat_rate_percent)),
      vat: formatEtb(Number(inv.vat_santim)),
      total: formatEtb(Number(inv.total_santim)),
      settlement:
        inv.status === "SETTLED_OFFLINE" && inv.settled_at
          ? `${toEatDateString(inv.settled_at)}, reference ${inv.settlement_ref ?? ""}`
          : null,
    });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: "invoice.downloaded",
      entityType: "invoice",
      entityId: inv.id,
      after: { invoiceNo: inv.invoice_no, status: inv.status },
      requestId,
    });
    return { fileName: `${inv.invoice_no}.pdf`, bytes };
  });
}

// ---------------------------------------------------------------- 6.1 daily job

/**
 * Daily checks (POST /api/jobs/daily-checks, CRON_SECRET): contract statuses (ACTIVE → EXPIRING_SOON → EXPIRED),
 * medicine expiry alerts (CLAUDE.md §12),
 * certificate retries (PENDING / FAILED → ISSUED), and idempotency keys older than 24 h. Licence warnings,
 * overdue pickups and past-due invoices are derived alerts (computed when the dashboard loads), so they need no
 * stored state; their counts are returned for the job log.
 */
export async function runDailyChecks(actor: Actor = null, requestId?: string) {
  const contractMoves = await updateContractStatuses(actor, requestId);
  const stockAlerts = await computeStockExpiryAlerts(undefined, requestId);
  const certificates = await processCertificateQueue({ limit: 50 });
  const purged = await inWorkflow((tx) => purgeExpiredIdempotencyKeys(tx));
  const derived = await derivedAlertCounts();
  return {
    contracts: contractMoves,
    stockAlerts,
    certificates,
    idempotencyKeysPurged: purged,
    alerts: derived,
  };
}

/** Contract statuses for today (part of the daily job). */
export async function updateContractStatuses(actor: Actor = null, requestId?: string) {
  return inWorkflow(async (tx) => {
    const warningDays = await getSetting("contract_expiry_warning_days", tx);
    const list = await all<{ id: string; status: string; end_date: string }>(
      tx,
      sql`SELECT id, status, to_char(end_date, 'YYYY-MM-DD') AS end_date FROM contracts
          WHERE status IN ('ACTIVE', 'EXPIRING_SOON') ORDER BY contract_code FOR UPDATE`
    );
    let expiring = 0;
    let expired = 0;
    for (const c of list) {
      const next = contractStatusOn(today(), c.end_date, warningDays);
      if (next === c.status || next === "ACTIVE") continue;
      await transition(tx, { entity: "contract", id: c.id, to: next, actor, requestId });
      if (next === "EXPIRED") expired++;
      else expiring++;
    }
    return { expiring, expired };
  });
}

async function derivedAlertCounts() {
  return inWorkflow(async (tx) => {
    const [licenceDays, overdueDays] = await Promise.all([
      getSetting("license_expiry_warning_days", tx),
      getSetting("overdue_pickup_days", tx),
    ]);
    return (await one<{ licences: number; overdue_pickups: number; past_due_invoices: number }>(
      tx,
      sql`SELECT
            (SELECT count(*) FROM licenses WHERE expires_on <= ${today()}::date + ${licenceDays}::int)::int AS licences,
            (SELECT count(*) FROM waste_records WHERE status = 'REGISTERED'
               AND created_at < now() - make_interval(days => ${overdueDays}))::int AS overdue_pickups,
            (SELECT count(*) FROM invoices WHERE status = 'ISSUED' AND due_date < ${today()}::date)::int AS past_due_invoices`
    ))!;
  });
}
