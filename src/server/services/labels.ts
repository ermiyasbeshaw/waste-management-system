import "server-only";
import { sql } from "drizzle-orm";
import { formatDate } from "@/lib/dates";
import type { WasteStatus } from "@/lib/statuses";
import { writeAudit } from "@/server/audit/writer";
import type { ActiveUser } from "@/server/auth/access-rules";
import { requireRole } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import type { DbExecutor } from "@/server/db/executor";
import { AppError } from "@/server/errors";
import {
  pdfLibRenderer,
  type LabelSheetInput,
  type PdfRenderer,
} from "@/server/integrations/pdf/labels";
import { getSetting } from "@/server/services/settings";
import { inWorkflow } from "@/server/workflow/engine";

/**
 * Container labels (CLAUDE.md §6): one label per container; codes never change, so a reprint gives the same codes.
 * Every print is audited (`labels.printed`, then `labels.reprinted`). Appendix C: hospital roles for their own
 * facility, super_admin for any. Labels exist only while the waste waits for pickup (REGISTERED / SCHEDULED);
 * a cancelled registration's labels are invalid.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRINTABLE: WasteStatus[] = ["REGISTERED", "SCHEDULED"];

export interface LabelSheet {
  wasteId: string;
  wasteCode: string;
  input: LabelSheetInput;
}

/** Loads and checks everything needed for the sheet (read-only; scoped to the user's facility). */
export async function loadLabelSheet(
  tx: DbExecutor,
  user: ActiveUser,
  wasteId: string
): Promise<LabelSheet> {
  if (!UUID.test(wasteId)) throw new AppError("NOT_FOUND", 404, "Waste record not found.");
  const isAdmin = user.role === "super_admin";
  if (!isAdmin && user.role !== "hospital_admin" && user.role !== "hospital_staff") {
    throw new AppError("FORBIDDEN", 403);
  }
  // Facility scope inside SQL: another facility's record is simply "not found" (no existence leak).
  const scope = isAdmin ? sql`TRUE` : sql`w.facility_id = ${user.facilityId}`;
  const [w] = (
    await tx.execute(sql`
      SELECT w.id, w.waste_code, w.status, w.container_count, w.created_at,
             f.name AS facility_name, c.name AS category_name, c.colour_code
      FROM waste_records w
      JOIN facilities f ON f.id = w.facility_id
      JOIN waste_categories c ON c.id = w.category_id
      WHERE w.id = ${wasteId} AND ${scope}
      LIMIT 1`)
  ).rows as {
    id: string;
    waste_code: string;
    status: WasteStatus;
    container_count: number;
    created_at: Date;
    facility_name: string;
    category_name: string;
    colour_code: string;
  }[];
  if (!w) throw new AppError("NOT_FOUND", 404, "Waste record not found.");
  if (w.status === "CANCELLED") {
    throw new AppError(
      "LABELS_INVALID",
      409,
      "This registration was cancelled; its labels are no longer valid."
    );
  }
  if (!PRINTABLE.includes(w.status)) {
    throw new AppError(
      "LABELS_NOT_NEEDED",
      409,
      "This waste has already been collected; labels cannot be printed."
    );
  }

  const containerRows = (
    await tx.execute(sql`
      SELECT container_code, seq_no FROM containers
      WHERE waste_record_id = ${w.id} ORDER BY seq_no LIMIT 1000`)
  ).rows as { container_code: string; seq_no: number }[];

  return {
    wasteId: w.id,
    wasteCode: w.waste_code,
    input: {
      systemName: await getSetting("system_name", tx),
      facilityName: w.facility_name,
      categoryName: w.category_name,
      colourCode: w.colour_code,
      wasteCode: w.waste_code,
      registeredOn: formatDate(w.created_at),
      labels: containerRows.map((c) => ({
        containerCode: c.container_code,
        seq: c.seq_no,
        total: w.container_count,
      })),
    },
  };
}

/** Writes `labels.printed` the first time, `labels.reprinted` afterwards. */
export async function auditLabelPrint(
  tx: DbExecutor,
  user: ActiveUser,
  sheet: LabelSheet,
  requestId?: string
): Promise<"labels.printed" | "labels.reprinted"> {
  const [{ n }] = (
    await tx.execute(sql`
      SELECT count(*)::int AS n FROM audit_logs
      WHERE entity_type = 'waste_record' AND entity_id = ${sheet.wasteId}
        AND action IN ('labels.printed', 'labels.reprinted')`)
  ).rows as { n: number }[];
  const action = n === 0 ? "labels.printed" : "labels.reprinted";
  await writeAudit(tx, {
    actor: { userId: user.id, role: user.role },
    action,
    entityType: "waste_record",
    entityId: sheet.wasteId,
    after: {
      wasteCode: sheet.wasteCode,
      containers: sheet.input.labels.length,
      printNumber: n + 1,
    },
    requestId: requestId ?? null,
  });
  return action;
}

/** GET /api/waste/{id}/labels: role check → load (scoped) → render (outside any transaction) → audit. */
export async function getContainerLabelsPdf(
  wasteId: string,
  meta: { requestId?: string } = {},
  renderer: PdfRenderer = pdfLibRenderer
): Promise<{ wasteCode: string; pdf: Uint8Array }> {
  const user = await requireRole("hospital_admin", "hospital_staff", "super_admin");
  if (await getSetting("label_amharic_enabled")) {
    // Not invented here: the client must supply the Amharic wording and the Noto Sans Ethiopic font file.
    throw new AppError(
      "LABELS_AMHARIC_NOT_CONFIGURED",
      501,
      "Amharic labels are switched on but not configured yet (wording and font are missing)."
    );
  }
  const sheet = await loadLabelSheet(db, user, wasteId);
  const pdf = await renderer.renderLabels(sheet.input);
  await inWorkflow((tx) => auditLabelPrint(tx, user, sheet, meta.requestId));
  return { wasteCode: sheet.wasteCode, pdf };
}
