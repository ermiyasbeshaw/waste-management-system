import "server-only";
import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/db/executor";

/**
 * Licence checks (CLAUDE.md §6): an expired licence blocks trip assignment and trip start; a licence expiring
 * within `license_expiry_warning_days` is a warning. Per subject, the LATEST licence of each kind counts (a renewal
 * is a new row).
 * ASSUMPTION: a subject without any licence on record is not blocked (only expiry is a rule in CLAUDE.md); the
 * admin dashboard can show missing licences once the client lists which licences are mandatory.
 */

export type LicenceSubject = { type: "VEHICLE" | "DRIVER" | "FACILITY" | "SITE"; id: string };

export interface LicenceProblem {
  subjectType: LicenceSubject["type"];
  subjectId: string;
  kind: string;
  number: string;
  expiresOn: string;
}

/** Expired licences (latest per kind) of the given subjects on `onDate` (YYYY-MM-DD, EAT calendar). */
export async function expiredLicences(
  tx: DbExecutor,
  subjects: LicenceSubject[],
  onDate: string
): Promise<LicenceProblem[]> {
  if (subjects.length === 0) return [];
  const pairs = sql.join(
    subjects.map((s) => sql`(${s.type}::license_subject, ${s.id}::uuid)`),
    sql`, `
  );
  const result = await tx.execute(sql`
    SELECT DISTINCT ON (l.subject_type, l.subject_id, l.kind)
           l.subject_type, l.subject_id, l.kind, l.number, to_char(l.expires_on, 'YYYY-MM-DD') AS expires_on
    FROM licenses l
    WHERE (l.subject_type, l.subject_id) IN (${pairs})
    ORDER BY l.subject_type, l.subject_id, l.kind, l.expires_on DESC`);
  return (
    result.rows as {
      subject_type: LicenceSubject["type"];
      subject_id: string;
      kind: string;
      number: string;
      expires_on: string;
    }[]
  )
    .filter((l) => l.expires_on < onDate)
    .map((l) => ({
      subjectType: l.subject_type,
      subjectId: l.subject_id,
      kind: l.kind,
      number: l.number,
      expiresOn: l.expires_on,
    }));
}
