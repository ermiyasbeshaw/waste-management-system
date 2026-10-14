import type { MohColor } from "@/types/waste";
import type { StopStatus } from "@/types/fleet";
import type { CertificateStatus } from "@/types/disposal";
import type { InvoiceStatus } from "@/types/finance";

/**
 * View-models returned by the server queries in src/server/queries (the prototype mocks were removed in Gate 2.17).
 * Status fields use the v1.2 statuses (`src/lib/statuses.ts`).
 */

/** ISO 8601 timestamp in UTC, or a plain `YYYY-MM-DD` date where the field says "date". */
export type Iso = string;
/** Integer money amount in santim (ETB × 100). Format with `formatEtb` from `@/lib/money`. */
export type Santim = number;

export interface FacilityRef {
  id: string;
  code: string;
  name: string;
}

export interface CategoryRef {
  code: string;
  name: string;
  /** MoH colour code (maps to waste_categories.colour_code). */
  colourCode: MohColor;
  colourHex: string;
}

export interface MapVehicle {
  id: string;
  plateNumber: string;
  tripCode: string;
  /** Latest GPS point of the trip in progress; all null = no GPS point yet ("no GPS"). */
  lat: number | null;
  lng: number | null;
  speedKmh: number | null;
  lastSeenAt: string | null;
  driverName: string | null;
}

export interface MapStop {
  id: string;
  order: number;
  facilityName: string;
  address: string;
  status: StopStatus;
  tripCode: string;
  lat: number | null;
  lng: number | null;
}

export interface MapData {
  vehicles: MapVehicle[];
  stops: MapStop[];
}

export interface InvoiceRow {
  id: string;
  invoiceNo: string;
  facility: FacilityRef;
  /** Human label of the billing period, e.g. "September 2026". */
  billingPeriod: string;
  /** Null until the schema stores subtotal and VAT separately (Gate 2). */
  subtotalSantim: Santim | null;
  vatSantim: Santim | null;
  totalSantim: Santim;
  status: InvoiceStatus;
  /** date */
  issuedOn: Iso | null;
  /** date */
  dueDate: Iso | null;
  /** Derived, not a status (CLAUDE.md §5): ISSUED and past its due date. */
  overdue: boolean;
}

export interface CertificateRow {
  id: string;
  certificateNo: string;
  facility: FacilityRef;
  status: CertificateStatus;
  /** date */
  issuedOn: Iso | null;
  /** Destruction method code, e.g. "HIGH_TEMP_INCINERATION". */
  methodCode: string;
  weightKg: number;
  containerCount: number;
  verifyToken: string;
}
