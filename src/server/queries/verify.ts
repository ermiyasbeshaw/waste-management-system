import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { toEatDateString } from "@/lib/dates";
import type { VerifyResult } from "@/types/view-models";
import { num, round2, rows } from "./_shared";

/**
 * Public certificate verification (CLAUDE.md §3 public route; DECISION v1.2 addendum). No sign-in, so no role
 * check: the token IS the access. Only ISSUED and REVOKED certificates are public — an unknown token, or a
 * PENDING / FAILED certificate, is "not found". Returns exactly the DECISION fields (see VerifyResult).
 * The PDF hash comparison and the public download are commands in src/server/services/certificates.ts.
 */
const TOKEN = /^[A-Za-z0-9_-]{22,100}$/;

export const getCertificateForVerification = cache(
  async (token: string): Promise<VerifyResult | null> => {
    if (!TOKEN.test(token)) return null;
    const [c] = await rows<{
      certificate_no: string;
      status: "ISSUED" | "REVOKED";
      issued_at: Date;
      facility_name: string;
      waste_code: string;
      category_name: string;
      container_count: number;
      weight_kg: string;
      destroyed_at: Date;
      method_name: string;
      verify_token: string;
    }>(sql`
      SELECT cert.certificate_no, cert.status, cert.issued_at, f.name AS facility_name, w.waste_code,
             cat.name AS category_name, w.container_count, w.weight_kg, d.destroyed_at, m.name AS method_name,
             cert.verify_token
      FROM certificates cert
      JOIN disposal_records d ON d.id = cert.disposal_record_id
      JOIN destruction_methods m ON m.id = d.method_id
      JOIN waste_records w ON w.id = d.waste_record_id
      JOIN facilities f ON f.id = w.facility_id
      JOIN waste_categories cat ON cat.id = w.category_id
      WHERE cert.verify_token = ${token} AND cert.status IN ('ISSUED', 'REVOKED')
      LIMIT 1`);
    if (!c) return null;
    return {
      certificateNo: c.certificate_no,
      status: c.status,
      issuedOn: toEatDateString(c.issued_at),
      facilityName: c.facility_name,
      wasteCode: c.waste_code,
      categoryName: c.category_name,
      containerCount: num(c.container_count),
      weightKg: round2(c.weight_kg),
      destroyedOn: toEatDateString(c.destroyed_at),
      destructionMethodName: c.method_name,
      verifyToken: c.verify_token,
    };
  }
);
