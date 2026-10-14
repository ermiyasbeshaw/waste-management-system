import type { CertificateStatus } from "@/lib/statuses";
import type { Iso } from "./shared";

/**
 * Public certificate verification (DECISION v1.2 addendum): EXACTLY these fields — certificate number, status, issue
 * date, facility name, Waste ID, category, container count, weight, destruction date and method. Never person
 * names, phone numbers or emails (and no free-text revoke reason).
 */
export interface VerifyResult {
  certificateNo: string;
  /** Only ISSUED or REVOKED certificates are public (PENDING / FAILED → not found). */
  status: Extract<CertificateStatus, "ISSUED" | "REVOKED">;
  /** date */
  issuedOn: Iso;
  facilityName: string;
  /** Waste ID, e.g. WR-2610-00042. */
  wasteCode: string;
  categoryName: string;
  containerCount: number;
  weightKg: number;
  /** date */
  destroyedOn: Iso;
  destructionMethodName: string;
  verifyToken: string;
}
