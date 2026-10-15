import type { MedicineRequestStatus } from "@/lib/statuses";
import type { FacilityRef } from "./shared";

/** Medicine stock and expiry (CLAUDE.md §12). */

/** Derived from the expiry date (not stored): EXPIRED, EXPIRING_SOON (within the largest alert threshold) or ACTIVE. */
export type StockState = "EXPIRED" | "EXPIRING_SOON" | "ACTIVE";

export interface StockRow {
  id: string;
  facility: FacilityRef;
  item: string;
  strength: string;
  form: string;
  batch: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  daysLeft: number;
  state: StockState;
  /** Smallest threshold already alerted (0 = expiry day), null = none yet. */
  lastAlertDays: number | null;
}

export interface StockAlertRow {
  stockId: string;
  facility: FacilityRef;
  item: string;
  strength: string;
  batch: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  daysLeft: number;
  thresholdDays: number;
}

export interface DisposalRequestRow {
  id: string;
  requestCode: string;
  facility: FacilityRef;
  status: MedicineRequestStatus;
  requestedBy: string;
  createdAt: string;
  containerCount: number;
  weightKg: number;
  scheduledDate: string | null;
  note: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  wasteCode: string | null;
  lines: {
    item: string;
    strength: string;
    form: string;
    batch: string;
    quantity: number;
    unit: string;
    expiryDate: string;
  }[];
}
