import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { revokeCertificateSchema } from "@/lib/validation/disposal";
import { toEatDateString } from "@/lib/dates";
import { env } from "@/env";
import { type CommandMeta, runIdempotent } from "@/server/api/command";
import { writeAudit } from "@/server/audit/writer";
import type { ActiveUser } from "@/server/auth/access-rules";
import { requireRole } from "@/server/auth/current-user";
import { withTransaction } from "@/server/db/client";
import { nextCode } from "@/server/db/codes";
import type { DbExecutor } from "@/server/db/executor";
import { certificates } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { renderCertificatePdf } from "@/server/integrations/pdf/certificate";
import { getStorage } from "@/server/integrations/storage";
import { log } from "@/server/log";
import { enqueueMessage } from "@/server/outbox/enqueue";
import { inWorkflow, transition } from "@/server/workflow/engine";
import type { Actor } from "@/server/workflow/table";
import { invalid } from "./_errors";
import { getSetting } from "./settings";

/**
 * Certificates of Disposal (CLAUDE.md §5–§6, Gate 5.3 / 5.5).
 * - Created PENDING in the destruction transaction (destruction is committed first and never rolled back).
 * - A retryable job renders the PDF, stores it, records its SHA-256 and issues it (PENDING/FAILED → ISSUED);
 *   a failure only marks the certificate FAILED — the destruction stays.
 * - Only ISSUED is publicly valid. Revoke (super_admin, reason) keeps the waste status; reissue = a new row.
 * - Downloads are audited.
 */

const one = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows[0] as T | undefined;
const all = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows as T[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{22,100}$/;
export const MAX_CHECK_FILE_BYTES = 10 * 1024 * 1024;

export const verifyUrl = (token: string) =>
  `${env.APP_BASE_URL.replace(/\/$/, "")}/verify/${token}`;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Inside the destruction (or reissue) transaction: a new PENDING certificate for the disposal record. */
export async function createPendingCertificate(
  tx: DbExecutor,
  disposalRecordId: string,
  actor: Actor,
  requestId?: string | null
): Promise<{ id: string; certificateNo: string }> {
  const certificateNo = await nextCode(tx, "certificate");
  const [row] = await tx
    .insert(certificates)
    .values({
      certificateNo,
      disposalRecordId,
      verifyToken: randomBytes(24).toString("base64url"),
    })
    .returning({ id: certificates.id });
  await writeAudit(tx, {
    actor: actor ? { userId: actor.id, role: actor.role } : null,
    action: "certificate.created",
    entityType: "certificate",
    entityId: row.id,
    after: { certificateNo, status: "PENDING" },
    requestId,
  });
  return { id: row.id, certificateNo };
}

/**
 * Background work after a commit (best effort; the certificates job retries PENDING / FAILED). Disabled together
 * with the outbox kick by OUTBOX_DISPATCH_AFTER_COMMIT=0 (development / tests), so tests run the job themselves.
 */
export function generateAfterCommit(certificateId: string): void {
  if (env.OUTBOX_DISPATCH_AFTER_COMMIT === "0") return;
  void generateCertificate(certificateId).catch((e) =>
    log.warn("Certificate generation after commit failed; the job will retry", { error: String(e) })
  );
}

type CertData = {
  id: string;
  generation_attempts: number;
  certificate_no: string;
  status: string;
  verify_token: string;
  waste_id: string;
  waste_code: string;
  weight_kg: string;
  destroyed_at: Date;
  method_name: string;
  facility_id: string;
  facility_name: string;
  facility_code: string;
  category_name: string;
};

/**
 * Renders, stores and issues one certificate. Returns the final status; a certificate that is already ISSUED (or
 * locked by a parallel run) is left alone. Errors are recorded on the row (FAILED), never thrown.
 */
export async function generateCertificate(
  certificateId: string
): Promise<"ISSUED" | "FAILED" | "SKIPPED"> {
  try {
    return await inWorkflow(async (tx) => {
      const c = await one<CertData>(
        tx,
        sql`SELECT cert.id, cert.generation_attempts, cert.certificate_no, cert.status, cert.verify_token,
                   w.id AS waste_id, w.waste_code, w.weight_kg, d.destroyed_at, m.name AS method_name,
                   f.id AS facility_id, f.name AS facility_name, f.code AS facility_code, cat.name AS category_name
            FROM certificates cert
            JOIN disposal_records d ON d.id = cert.disposal_record_id
            JOIN destruction_methods m ON m.id = d.method_id
            JOIN waste_records w ON w.id = d.waste_record_id
            JOIN facilities f ON f.id = w.facility_id
            JOIN waste_categories cat ON cat.id = w.category_id
            WHERE cert.id = ${certificateId}
            FOR UPDATE OF cert SKIP LOCKED`
      );
      if (!c || (c.status !== "PENDING" && c.status !== "FAILED")) return "SKIPPED" as const;

      const containers = await all<{
        container_code: string;
        status: string;
        reason: string | null;
      }>(
        tx,
        sql`SELECT container_code, status, exception_reason AS reason FROM containers
            WHERE waste_record_id = ${c.waste_id} ORDER BY seq_no`
      );
      const now = new Date();
      const pdf = await renderCertificatePdf({
        systemName: await getSetting("system_name", tx),
        certificateNo: c.certificate_no,
        issuedOn: toEatDateString(now),
        facilityName: c.facility_name,
        facilityCode: c.facility_code,
        wasteCode: c.waste_code,
        categoryName: c.category_name,
        weightKg: Number(c.weight_kg),
        destroyedOn: toEatDateString(c.destroyed_at),
        methodName: c.method_name,
        verifyUrl: verifyUrl(c.verify_token),
        destroyed: containers.filter((x) => x.status === "DESTROYED").map((x) => x.container_code),
        exceptions: containers
          .filter((x) => x.status === "MISSING" || x.status === "REFUSED")
          .map((x) => ({
            containerCode: x.container_code,
            status: x.status as "MISSING" | "REFUSED",
            reason: x.reason ?? "",
          })),
      });
      const fileKey = `certificates/${c.certificate_no.slice(3, 7)}/${c.certificate_no}.pdf`;
      await getStorage().put(fileKey, pdf, "application/pdf");
      await transition(tx, {
        entity: "certificate",
        id: c.id,
        to: "ISSUED",
        actor: null,
        set: {
          fileKey,
          sha256: sha256(pdf),
          issuedAt: now,
          generationAttempts: Number(c.generation_attempts) + 1,
          lastError: null,
        },
        action: "certificate.issued",
      });

      const recipients = await all<{ email: string }>(
        tx,
        sql`SELECT DISTINCT email FROM users WHERE (
              (facility_id = ${c.facility_id} AND role = 'hospital_admin')
              OR role IN ('super_admin', 'efda_officer')
            ) AND active AND email IS NOT NULL LIMIT 50`
      );
      for (const r of recipients) {
        await enqueueMessage(tx, {
          template: "certificate.issued",
          recipient: r.email,
          data: {
            certificateNo: c.certificate_no,
            wasteCode: c.waste_code,
            facilityName: c.facility_name,
            verifyUrl: verifyUrl(c.verify_token),
          },
        });
      }
      return "ISSUED" as const;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Certificate generation failed", err, { certificateId });
    try {
      await inWorkflow(async (tx) => {
        const c = await one<{ status: string; generation_attempts: number }>(
          tx,
          sql`SELECT status, generation_attempts FROM certificates WHERE id = ${certificateId} FOR UPDATE`
        );
        if (!c || (c.status !== "PENDING" && c.status !== "FAILED")) return;
        await transition(tx, {
          entity: "certificate",
          id: certificateId,
          to: "FAILED",
          actor: null,
          set: {
            generationAttempts: Number(c.generation_attempts) + 1,
            lastError: message.slice(0, 500),
          },
          action: "certificate.generation_failed",
        });
      });
    } catch (e) {
      log.error("Could not record the certificate failure", e, { certificateId });
    }
    return "FAILED";
  }
}

/** Job (POST /api/jobs/certificates and the daily job): generates every PENDING / FAILED certificate. */
export async function processCertificateQueue(
  opts: { limit?: number } = {}
): Promise<{ issued: number; failed: number; skipped: number }> {
  const ids = await withTransaction(async (tx) =>
    all<{ id: string }>(
      tx,
      sql`SELECT id FROM certificates WHERE status IN ('PENDING', 'FAILED')
          ORDER BY created_at LIMIT ${Math.min(Math.max(opts.limit ?? 20, 1), 100)}`
    )
  );
  const summary = { issued: 0, failed: 0, skipped: 0 };
  for (const { id } of ids) {
    const r = await generateCertificate(id);
    if (r === "ISSUED") summary.issued++;
    else if (r === "FAILED") summary.failed++;
    else summary.skipped++;
  }
  return summary;
}

/** super_admin runs the certificate job now (same work as POST /api/jobs/certificates). Audited. */
export async function runCertificateJobNow(requestId?: string) {
  const admin = await requireRole("super_admin");
  const summary = await processCertificateQueue({ limit: 50 });
  await inWorkflow((tx) =>
    writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "job.certificates_run",
      entityType: "job",
      after: summary,
      requestId,
    })
  );
  return summary;
}

/** Revoke an ISSUED certificate (super_admin, reason). With `reissue`, a new certificate is created (PENDING). */
export async function revokeCertificate(certificateId: string, raw: unknown, meta: CommandMeta) {
  const admin = await requireRole("super_admin");
  const parsed = revokeCertificateSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  if (!UUID.test(certificateId)) throw new AppError("NOT_FOUND", 404, "Certificate not found.");
  const result = await runIdempotent(
    admin,
    `POST /api/certificates/${certificateId}/revoke`,
    meta,
    parsed.data,
    async (tx) => {
      const { row } = await transition(tx, {
        entity: "certificate",
        id: certificateId,
        to: "REVOKED",
        actor: admin,
        reason: parsed.data.reason,
        requestId: meta.requestId,
      });
      let reissued: { id: string; certificateNo: string } | null = null;
      if (parsed.data.reissue) {
        reissued = await createPendingCertificate(
          tx,
          row.disposal_record_id as string,
          admin,
          meta.requestId
        );
      }
      return {
        certificateNo: row.certificate_no as string,
        status: "REVOKED",
        reissued: reissued ? { id: reissued.id, certificateNo: reissued.certificateNo } : null,
      };
    }
  );
  if (result.reissued) generateAfterCommit(result.reissued.id);
  return result;
}

type FileRow = {
  id: string;
  certificate_no: string;
  status: string;
  file_key: string | null;
  sha256: string | null;
  facility_id: string;
};

async function readStoredPdf(c: FileRow): Promise<Uint8Array> {
  if (!c.file_key) throw new AppError("NOT_FOUND", 404, "This certificate has no file yet.");
  const bytes = await getStorage().get(c.file_key);
  if (!bytes) throw new AppError("FILE_MISSING", 404, "The certificate file is not available.");
  return bytes;
}

/**
 * Signed-in download (ISSUED or REVOKED): super_admin and the EFDA officer for every facility, hospital roles
 * for their own facility only. Audited.
 */
export async function downloadCertificate(
  certificateId: string,
  requestId?: string
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const user: ActiveUser = await requireRole(
    "super_admin",
    "efda_officer",
    "hospital_admin",
    "hospital_staff"
  );
  if (!UUID.test(certificateId)) throw new AppError("NOT_FOUND", 404, "Certificate not found.");
  // Hospital roles: own facility only, checked inside SQL (CLAUDE.md §3).
  const scope =
    user.role === "hospital_admin" || user.role === "hospital_staff"
      ? sql`AND w.facility_id = ${user.facilityId}`
      : sql``;
  return inWorkflow(async (tx) => {
    const c = await one<FileRow>(
      tx,
      sql`SELECT cert.id, cert.certificate_no, cert.status, cert.file_key, cert.sha256, w.facility_id
          FROM certificates cert
          JOIN disposal_records d ON d.id = cert.disposal_record_id
          JOIN waste_records w ON w.id = d.waste_record_id
          WHERE cert.id = ${certificateId} ${scope}`
    );
    if (!c || (c.status !== "ISSUED" && c.status !== "REVOKED")) {
      throw new AppError("NOT_FOUND", 404, "Certificate not found.");
    }
    const bytes = await readStoredPdf(c);
    await writeAudit(tx, {
      actor: { userId: user.id, role: user.role },
      action: "certificate.downloaded",
      entityType: "certificate",
      entityId: c.id,
      after: { certificateNo: c.certificate_no, status: c.status },
      requestId,
    });
    return { fileName: `${c.certificate_no}.pdf`, bytes };
  });
}

/** Public download by verify token: ISSUED only (PENDING / FAILED / REVOKED have no public download). Audited. */
export async function downloadPublicCertificate(
  token: string,
  requestId?: string
): Promise<{ fileName: string; bytes: Uint8Array }> {
  if (!TOKEN.test(token)) throw new AppError("NOT_FOUND", 404, "Certificate not found.");
  return inWorkflow(async (tx) => {
    const c = await one<FileRow>(
      tx,
      sql`SELECT cert.id, cert.certificate_no, cert.status, cert.file_key, cert.sha256, w.facility_id
          FROM certificates cert
          JOIN disposal_records d ON d.id = cert.disposal_record_id
          JOIN waste_records w ON w.id = d.waste_record_id
          WHERE cert.verify_token = ${token} AND cert.status = 'ISSUED'`
    );
    if (!c) throw new AppError("NOT_FOUND", 404, "Certificate not found.");
    const bytes = await readStoredPdf(c);
    await writeAudit(tx, {
      actor: null,
      action: "certificate.downloaded_public",
      entityType: "certificate",
      entityId: c.id,
      after: { certificateNo: c.certificate_no },
      requestId,
    });
    return { fileName: `${c.certificate_no}.pdf`, bytes };
  });
}

/**
 * Public check (Gate 5.4): does an uploaded PDF match the stored certificate? Compares SHA-256 only; the file is
 * not stored. Unknown token or a PENDING / FAILED certificate → 404.
 */
export async function checkCertificateFile(
  token: string,
  bytes: Uint8Array
): Promise<{ match: boolean; status: "ISSUED" | "REVOKED"; certificateNo: string }> {
  if (!TOKEN.test(token)) throw new AppError("NOT_FOUND", 404, "Certificate not found.");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CHECK_FILE_BYTES) {
    throw new AppError("VALIDATION_ERROR", 422, "Upload the certificate PDF (at most 10 MB).");
  }
  const c = await withTransaction((tx) =>
    one<{ certificate_no: string; status: "ISSUED" | "REVOKED"; sha256: string | null }>(
      tx,
      sql`SELECT certificate_no, status, sha256 FROM certificates
          WHERE verify_token = ${token} AND status IN ('ISSUED', 'REVOKED')`
    )
  );
  if (!c || !c.sha256) throw new AppError("NOT_FOUND", 404, "Certificate not found.");
  return { match: sha256(bytes) === c.sha256, status: c.status, certificateNo: c.certificate_no };
}
