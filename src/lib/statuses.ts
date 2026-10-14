/**
 * Every status of CLAUDE.md §5 — the single source for the Postgres enums (`src/server/db/schema/enums.ts`), the
 * TypeScript types (`src/types`) and the UI (`StatusBadge`). Pure constants: safe in client components.
 */

export const WASTE_STATUSES = [
  "REGISTERED",
  "SCHEDULED",
  "IN_TRANSIT",
  "RECEIVED",
  "DISPOSED",
  "DISPOSED_WITH_EXCEPTION",
  "CLOSED_NO_DESTRUCTION",
  "CANCELLED",
] as const;
export const CONTAINER_STATUSES = [
  "LABELLED",
  "SCANNED_AT_PICKUP",
  "COLLECTED",
  "RECEIVED",
  "MISSING",
  "REFUSED",
  "DESTROYED",
] as const;
export const HANDOVER_STATUSES = ["SCANNED", "CANCELLED"] as const;
export const TRIP_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const STOP_STATUSES = [
  "PENDING",
  "ARRIVED",
  "COLLECTED",
  "COLLECTED_OVERRIDE",
  "SKIPPED",
] as const;
export const COLLECTION_METHODS = ["OTP", "IN_APP", "OVERRIDE"] as const;
export const OTP_STATUSES = ["ISSUED", "VERIFIED", "EXPIRED", "LOCKED", "CANCELLED"] as const;
export const CERTIFICATE_STATUSES = ["PENDING", "ISSUED", "FAILED", "REVOKED"] as const;
export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "SETTLED_OFFLINE", "CANCELLED"] as const;
export const CONTRACT_STATUSES = ["ACTIVE", "EXPIRING_SOON", "EXPIRED"] as const;
export const FACILITY_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export const VEHICLE_STATUSES = ["ACTIVE", "IN_TRANSIT", "MAINTENANCE", "OFFLINE"] as const;
export const DRIVER_STATUSES = ["ON_DUTY", "ON_TRIP", "OFF_DUTY"] as const;
export const OUTBOX_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
/** Medicine disposal requests (CLAUDE.md §12): approved or rejected only by the EFDA officer. */
export const MEDICINE_REQUEST_STATUSES = ["PENDING_APPROVAL", "APPROVED", "REJECTED"] as const;

export type WasteStatus = (typeof WASTE_STATUSES)[number];
export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];
export type TripStatus = (typeof TRIP_STATUSES)[number];
export type StopStatus = (typeof STOP_STATUSES)[number];
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];
export type OtpStatus = (typeof OTP_STATUSES)[number];
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type FacilityStatus = (typeof FACILITY_STATUSES)[number];
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];
export type DriverStatus = (typeof DRIVER_STATUSES)[number];
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];
export type MedicineRequestStatus = (typeof MEDICINE_REQUEST_STATUSES)[number];

/** Every status value of every entity (values shared by several entities appear once). */
export type StatusValue =
  | WasteStatus
  | ContainerStatus
  | HandoverStatus
  | TripStatus
  | StopStatus
  | CollectionMethod
  | OtpStatus
  | CertificateStatus
  | InvoiceStatus
  | ContractStatus
  | FacilityStatus
  | VehicleStatus
  | DriverStatus
  | OutboxStatus
  | MedicineRequestStatus;

/**
 * Derived conditions shown like a status but NOT stored as one (CLAUDE.md §5–§6): an issued invoice past its due
 * date, a facility without a contract, a facility without an OTP recipient, an arrival without a recent GPS point.
 */
export const DERIVED_FLAGS = ["OVERDUE", "NO_CONTRACT", "NOT_READY", "NO_GPS"] as const;
export type DerivedFlag = (typeof DERIVED_FLAGS)[number];

export type BadgeTone =
  "success" | "progress" | "warning" | "info" | "draft" | "danger" | "neutral";

/** Text (always shown — never colour alone, CLAUDE.md §9) and tone for every value. */
export const STATUS_META: Record<StatusValue | DerivedFlag, { label: string; tone: BadgeTone }> = {
  // waste
  REGISTERED: { label: "Registered", tone: "warning" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  IN_TRANSIT: { label: "In transit", tone: "progress" },
  RECEIVED: { label: "Received", tone: "info" },
  DISPOSED: { label: "Disposed", tone: "success" },
  DISPOSED_WITH_EXCEPTION: { label: "Disposed with exception", tone: "warning" },
  CLOSED_NO_DESTRUCTION: { label: "Closed, not destroyed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  // container
  LABELLED: { label: "Labelled", tone: "warning" },
  SCANNED_AT_PICKUP: { label: "Scanned at pickup", tone: "progress" },
  COLLECTED: { label: "Collected", tone: "progress" },
  MISSING: { label: "Missing", tone: "danger" },
  REFUSED: { label: "Refused", tone: "danger" },
  DESTROYED: { label: "Destroyed", tone: "success" },
  // handover
  SCANNED: { label: "Scanned", tone: "progress" },
  // trip / stop
  PLANNED: { label: "Planned", tone: "warning" },
  IN_PROGRESS: { label: "In progress", tone: "progress" },
  COMPLETED: { label: "Completed", tone: "success" },
  PENDING: { label: "Pending", tone: "warning" },
  ARRIVED: { label: "Arrived", tone: "progress" },
  COLLECTED_OVERRIDE: { label: "Collected (override)", tone: "warning" },
  SKIPPED: { label: "Skipped", tone: "danger" },
  // collection method
  OTP: { label: "OTP", tone: "neutral" },
  IN_APP: { label: "In-app confirmation", tone: "neutral" },
  OVERRIDE: { label: "Admin override", tone: "warning" },
  // otp
  ISSUED: { label: "Issued", tone: "success" },
  VERIFIED: { label: "Verified", tone: "success" },
  EXPIRED: { label: "Expired", tone: "danger" },
  LOCKED: { label: "Locked", tone: "danger" },
  // certificate / outbox
  FAILED: { label: "Failed", tone: "danger" },
  REVOKED: { label: "Revoked", tone: "danger" },
  SENT: { label: "Sent", tone: "success" },
  // medicine disposal request
  PENDING_APPROVAL: { label: "Waiting for EFDA", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  // invoice / contract
  DRAFT: { label: "Draft", tone: "draft" },
  SETTLED_OFFLINE: { label: "Settled (offline)", tone: "success" },
  ACTIVE: { label: "Active", tone: "success" },
  EXPIRING_SOON: { label: "Expiring soon", tone: "warning" },
  // facility / vehicle / driver
  INACTIVE: { label: "Inactive", tone: "neutral" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
  MAINTENANCE: { label: "Maintenance", tone: "warning" },
  OFFLINE: { label: "Offline", tone: "neutral" },
  ON_DUTY: { label: "On duty", tone: "success" },
  ON_TRIP: { label: "On trip", tone: "progress" },
  OFF_DUTY: { label: "Off duty", tone: "neutral" },
  // derived
  OVERDUE: { label: "Overdue", tone: "danger" },
  NO_CONTRACT: { label: "No contract", tone: "danger" },
  NOT_READY: { label: "Not ready (no OTP recipient)", tone: "danger" },
  NO_GPS: { label: "No GPS", tone: "neutral" },
};
