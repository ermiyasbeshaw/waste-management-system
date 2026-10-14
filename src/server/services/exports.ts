import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { formatDateTime, toEatDateString } from "@/lib/dates";
import { writeAudit } from "@/server/audit/writer";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { requireRole } from "@/server/auth/current-user";
import type { DbExecutor } from "@/server/db/executor";
import { AppError } from "@/server/errors";
import { renderTablePdf } from "@/server/integrations/pdf/table";
import { renderXlsx } from "@/server/integrations/xlsx";
import { inWorkflow } from "@/server/workflow/engine";
import { getSetting } from "./settings";

/**
 * Exports (Gate 6.4): PDF or XLSX of a report, in the caller's scope (CLAUDE.md §3) — hospital roles only their own
 * facility, inside SQL. Every export is audited (report, format, row count). Personal data is left out (no person
 * names, phones or emails); amounts in ETB.
 * ASSUMPTION: at most 5 000 rows per export, newest first.
 */

export const REPORTS = [
  "waste",
  "certificates",
  "invoices",
  "audit",
  "stock",
  "medicine-requests",
] as const;
export type ReportName = (typeof REPORTS)[number];
export type ExportFormat = "xlsx" | "pdf";
const MAX_ROWS = 5000;

const ROLES: Record<ReportName, readonly Role[]> = {
  waste: ["super_admin", "efda_officer", "hospital_admin", "hospital_staff"],
  certificates: ["super_admin", "efda_officer", "hospital_admin", "hospital_staff"],
  invoices: ["super_admin", "hospital_admin"],
  audit: ["super_admin", "efda_officer"],
  // CLAUDE.md §12: never the driver or the disposal operator.
  stock: ["super_admin", "efda_officer", "hospital_admin", "hospital_staff"],
  "medicine-requests": ["super_admin", "efda_officer", "hospital_admin", "hospital_staff"],
};

const TITLES: Record<ReportName, string> = {
  waste: "Waste register",
  certificates: "Certificates of Disposal",
  invoices: "Invoices",
  audit: "Audit log",
  stock: "Medicine stock",
  "medicine-requests": "Medicine disposal requests",
};

const etb = (santim: unknown) => (Number(santim) / 100).toFixed(2);
const isHospital = (u: ActiveUser) => u.role === "hospital_admin" || u.role === "hospital_staff";

type Table = { headers: string[]; rows: (string | number)[][] };

async function load(tx: DbExecutor, report: ReportName, user: ActiveUser): Promise<Table> {
  const own = (column: SQL) => (isHospital(user) ? sql`AND ${column} = ${user.facilityId}` : sql``);
  const run = async <T>(q: SQL) => (await tx.execute(q)).rows as T[];
  switch (report) {
    case "waste": {
      const rows = await run<{
        waste_code: string;
        facility: string;
        category: string;
        container_count: number;
        weight_kg: string;
        status: string;
        created_at: Date;
      }>(sql`
        SELECT w.waste_code, f.name AS facility, c.name AS category, w.container_count, w.weight_kg, w.status,
               w.created_at
        FROM waste_records w JOIN facilities f ON f.id = w.facility_id JOIN waste_categories c ON c.id = w.category_id
        WHERE TRUE ${own(sql`w.facility_id`)}
        ORDER BY w.created_at DESC LIMIT ${MAX_ROWS}`);
      return {
        headers: [
          "Waste ID",
          "Facility",
          "Category",
          "Containers",
          "Weight (kg)",
          "Status",
          "Registered",
        ],
        rows: rows.map((r) => [
          r.waste_code,
          r.facility,
          r.category,
          Number(r.container_count),
          Number(r.weight_kg),
          r.status,
          toEatDateString(r.created_at),
        ]),
      };
    }
    case "certificates": {
      const rows = await run<{
        certificate_no: string;
        facility: string;
        waste_code: string;
        status: string;
        issued_at: Date | null;
        method: string | null;
      }>(sql`
        SELECT cert.certificate_no, f.name AS facility, w.waste_code, cert.status, cert.issued_at, m.name AS method
        FROM certificates cert
        JOIN disposal_records d ON d.id = cert.disposal_record_id
        LEFT JOIN destruction_methods m ON m.id = d.method_id
        JOIN waste_records w ON w.id = d.waste_record_id
        JOIN facilities f ON f.id = w.facility_id
        WHERE TRUE ${own(sql`w.facility_id`)}
        ORDER BY cert.certificate_no DESC LIMIT ${MAX_ROWS}`);
      return {
        headers: ["Certificate No", "Facility", "Waste ID", "Status", "Issued", "Method"],
        rows: rows.map((r) => [
          r.certificate_no,
          r.facility,
          r.waste_code,
          r.status,
          r.issued_at ? toEatDateString(r.issued_at) : "",
          r.method ?? "",
        ]),
      };
    }
    case "invoices": {
      const today = toEatDateString(new Date());
      const rows = await run<{
        invoice_no: string;
        facility: string;
        period_start: string;
        subtotal_santim: string;
        vat_santim: string;
        total_santim: string;
        status: string;
        due_date: string | null;
      }>(sql`
        SELECT i.invoice_no, f.name AS facility, to_char(i.period_start, 'YYYY-MM') AS period_start,
               i.subtotal_santim, i.vat_santim, i.total_santim, i.status, to_char(i.due_date, 'YYYY-MM-DD') AS due_date
        FROM invoices i JOIN facilities f ON f.id = i.facility_id
        WHERE TRUE ${own(sql`i.facility_id`)} ${isHospital(user) ? sql`AND i.status <> 'DRAFT'` : sql``}
        ORDER BY i.invoice_no DESC LIMIT ${MAX_ROWS}`);
      return {
        headers: [
          "Invoice No",
          "Facility",
          "Month",
          "Subtotal (ETB)",
          "VAT (ETB)",
          "Total (ETB)",
          "Status",
          "Due",
          "Overdue",
        ],
        rows: rows.map((r) => [
          r.invoice_no,
          r.facility,
          r.period_start,
          etb(r.subtotal_santim),
          etb(r.vat_santim),
          etb(r.total_santim),
          r.status,
          r.due_date ?? "",
          r.status === "ISSUED" && r.due_date !== null && r.due_date < today ? "yes" : "",
        ]),
      };
    }
    case "stock": {
      const t = toEatDateString(new Date());
      const rows = await run<{
        facility: string;
        item: string;
        strength: string;
        form: string;
        batch: string;
        quantity: number;
        unit: string;
        expiry_date: string;
        days_left: number;
      }>(sql`
        SELECT f.name AS facility, s.item, s.strength, s.form, s.batch, s.quantity, s.unit,
               to_char(s.expiry_date, 'YYYY-MM-DD') AS expiry_date, (s.expiry_date - ${t}::date) AS days_left
        FROM medicine_stock s JOIN facilities f ON f.id = s.facility_id
        WHERE s.active ${own(sql`s.facility_id`)}
        ORDER BY s.expiry_date, f.name LIMIT ${MAX_ROWS}`);
      return {
        headers: [
          "Facility",
          "Item",
          "Strength",
          "Form",
          "Batch",
          "Quantity",
          "Unit",
          "Expiry",
          "Days left",
        ],
        rows: rows.map((r) => [
          r.facility,
          r.item,
          r.strength,
          r.form,
          r.batch,
          Number(r.quantity),
          r.unit,
          r.expiry_date,
          Number(r.days_left),
        ]),
      };
    }
    case "medicine-requests": {
      const rows = await run<{
        request_code: string;
        facility: string;
        status: string;
        created_at: Date;
        lines: number;
        decision_reason: string | null;
        waste_code: string | null;
      }>(sql`
        SELECT r.request_code, f.name AS facility, r.status, r.created_at,
               (SELECT count(*) FROM medicine_disposal_request_lines l WHERE l.request_id = r.id)::int AS lines,
               r.decision_reason, w.waste_code
        FROM medicine_disposal_requests r JOIN facilities f ON f.id = r.facility_id
        LEFT JOIN waste_records w ON w.id = r.waste_record_id
        WHERE TRUE ${own(sql`r.facility_id`)}
        ORDER BY r.created_at DESC LIMIT ${MAX_ROWS}`);
      return {
        headers: [
          "Request",
          "Facility",
          "Status",
          "Requested",
          "Lines",
          "Decision reason",
          "Waste ID",
        ],
        rows: rows.map((r) => [
          r.request_code,
          r.facility,
          r.status,
          toEatDateString(r.created_at),
          Number(r.lines),
          r.decision_reason ?? "",
          r.waste_code ?? "",
        ]),
      };
    }
    case "audit": {
      const rows = await run<{
        seq: number;
        created_at: Date;
        action: string;
        entity_type: string;
        actor_role: string | null;
        hash: string;
      }>(sql`
        SELECT seq, created_at, action, entity_type, role AS actor_role, hash
        FROM audit_logs ORDER BY seq DESC LIMIT ${MAX_ROWS}`);
      return {
        headers: ["Seq", "Time (EAT)", "Action", "Entity", "Actor role", "Hash"],
        rows: rows.map((r) => [
          Number(r.seq),
          formatDateTime(r.created_at),
          r.action,
          r.entity_type,
          r.actor_role ?? "system",
          r.hash.slice(0, 16),
        ]),
      };
    }
  }
}

export async function exportReport(
  report: string,
  format: string,
  requestId?: string
): Promise<{ fileName: string; contentType: string; bytes: Uint8Array }> {
  if (!(REPORTS as readonly string[]).includes(report))
    throw new AppError("NOT_FOUND", 404, "Unknown report.");
  const name = report as ReportName;
  const user = await requireRole(...ROLES[name]);
  if (isHospital(user) && !user.facilityId) throw new AppError("FORBIDDEN", 403);
  // Validation after the role check (request pipeline: role → validation).
  if (format !== "xlsx" && format !== "pdf") {
    throw new AppError("VALIDATION_ERROR", 422, "Format must be xlsx or pdf.");
  }
  return inWorkflow(async (tx) => {
    const table = await load(tx, name, user);
    const systemName = await getSetting("system_name", tx);
    const stamp = toEatDateString(new Date());
    const bytes =
      format === "xlsx"
        ? await renderXlsx({
            sheetName: TITLES[name],
            headers: table.headers,
            rows: table.rows,
            creator: systemName,
          })
        : await renderTablePdf({
            systemName,
            title: TITLES[name],
            subtitle: `Generated ${formatDateTime(new Date())} EAT · ${table.rows.length} rows${
              table.rows.length === MAX_ROWS ? " (newest only)" : ""
            }`,
            headers: table.headers,
            rows: table.rows.map((r) => r.map(String)),
          });
    await writeAudit(tx, {
      actor: { userId: user.id, role: user.role },
      action: "export.downloaded",
      entityType: "export",
      after: { report: name, format, rows: table.rows.length },
      requestId,
    });
    return {
      fileName: `safewaste-${name}-${stamp}.${format}`,
      contentType:
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      bytes,
    };
  });
}
