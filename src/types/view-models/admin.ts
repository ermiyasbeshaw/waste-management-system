import type { CertificateStatus } from "@/lib/statuses";
import type { TripStatus } from "@/types/fleet";
import type { ContractStatus } from "@/types/finance";
import type { CategoryRef, FacilityRef, Iso, Santim } from "./shared";

export interface AdminKpis {
  awaitingPickupCount: number;
  awaitingPickupKg: number;
  tripsTodayCount: number;
  tripsInProgressCount: number;
  inTransitCount: number;
  awaitingDestructionCount: number;
  overduePickupsCount: number;
  /** The `overdue_pickup_days` setting used for the count. */
  overduePickupDays: number;
  outstandingSantim: Santim;
  outstandingCount: number;
  settledSantim: Santim;
  settledCount: number;
  draftCount: number;
}

export interface TripRow {
  id: string;
  tripCode: string;
  /** date */
  plannedDate: Iso;
  status: TripStatus;
  vehiclePlate: string;
  driverName: string;
  stopsCompleted: number;
  stopsTotal: number;
  containersTotal: number;
  weightKgTotal: number;
}

export interface ContractRow {
  id: string;
  contractCode: string;
  facility: FacilityRef;
  /** date */
  startDate: Iso;
  /** date */
  endDate: Iso;
  monthlyFeeSantim: Santim;
  status: ContractStatus;
  daysUntilExpiry: number;
  terms: string | null;
}

export interface AdminAlerts {
  overrides: { id: string; facilityName: string; details: string; at: Iso }[];
  vehiclesWithoutTracker: { id: string; plateNumber: string; model: string }[];
  uncontractedFacilities: FacilityRef[];
  /** Health facilities without an active hospital user who has a verified phone and receives pickup OTPs. */
  facilitiesNotReady: FacilityRef[];
  /** REGISTERED waste older than `overdue_pickup_days`. */
  overduePickups: { id: string; wasteCode: string; facilityName: string; daysWaiting: number }[];
  /** Vehicles on an IN_PROGRESS trip with no GPS point in the last `tracker_silent_minutes`. */
  silentTrackers: { id: string; plateNumber: string; tripCode: string; lastSeenAt: Iso | null }[];
  /** Outbox messages that failed for good (sending stopped). */
  failedMessages: {
    id: string;
    channel: string;
    template: string;
    lastError: string | null;
    at: Iso;
  }[];
  /** Issued invoices past their due date (derived, not a status). */
  overdueInvoices: {
    id: string;
    invoiceNo: string;
    facilityName: string;
    dueDate: Iso;
    totalSantim: Santim;
  }[];
  /**
   * Disposal exceptions of the last 30 days (CLAUDE.md §5–§6): containers MISSING / REFUSED, waste closed without
   * destruction, and certificates whose generation FAILED (retried by the job).
   */
  disposalExceptions: {
    id: string;
    code: string;
    kind: "MISSING" | "REFUSED" | "CLOSED_NO_DESTRUCTION" | "CERTIFICATE_FAILED";
    facilityName: string;
    details: string | null;
    at: Iso;
  }[];
  /** Licences expired or expiring within `license_expiry_warning_days`. */
  expiringLicences: {
    id: string;
    subject: string;
    kind: string;
    number: string;
    expiresOn: Iso;
    expired: boolean;
  }[];
}

/** Waste registered in the last 30 days per category (kg). */
export type CategoryVolume = CategoryRef & { kg: number };

/** /admin/facilities row: master data + readiness (CLAUDE.md §6: no OTP recipient → not ready). */
export interface FacilityRow extends FacilityRef {
  type: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  region: string;
  address: string;
  usersCount: number;
  otpRecipients: number;
  /** null = no contract. */
  contractStatus: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | null;
  /** Health facility, ACTIVE, with at least one OTP recipient. */
  ready: boolean;
}

/** Full facility record for the edit form. */
export interface FacilityDetail extends FacilityRow {
  city: string | null;
  subCity: string | null;
  woreda: string | null;
  kebele: string | null;
  lat: number;
  lng: number;
}

/** /admin/users and /hospital/users row (identity comes from Clerk; phone masked). */
export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  phoneMasked: string | null;
  phoneVerified: boolean;
  role: string | null;
  facility: FacilityRef | null;
  active: boolean;
  receivesPickupOtp: boolean;
}

/** /admin/fleet/manage (3.2). Licence state: EXPIRED blocks assignment; EXPIRING within the warning window. */
export type LicenceState = "VALID" | "EXPIRING" | "EXPIRED" | "NONE";

export interface FleetData {
  vehicles: {
    id: string;
    plateNo: string;
    model: string | null;
    capacityKg: number;
    status: "ACTIVE" | "IN_TRANSIT" | "MAINTENANCE" | "OFFLINE";
    trackerDeviceId: string | null;
    licence: LicenceState;
  }[];
  drivers: {
    id: string;
    name: string;
    licenseNo: string;
    status: "ON_DUTY" | "ON_TRIP" | "OFF_DUTY";
    defaultVehiclePlate: string | null;
    licence: LicenceState;
  }[];
  trackers: {
    id: string;
    deviceId: string;
    vehiclePlate: string | null;
    active: boolean;
    lastSeenAt: Iso | null;
  }[];
  licences: {
    id: string;
    subjectType: string;
    subject: string;
    kind: string;
    number: string;
    expiresOn: Iso;
    state: Exclude<LicenceState, "NONE">;
  }[];
  /** Users with the driver role who have no driver profile yet. */
  driverCandidates: { id: string; name: string }[];
  warningDays: number;
}

/** Trip planning (3.3): one row per facility with waste waiting (REGISTERED, not on an open stop). */
export interface WaitingFacility extends FacilityRef {
  ready: boolean;
  wasteCount: number;
  containers: number;
  kg: number;
  oldestDays: number;
  overdue: boolean;
}

export interface TripPlanningOptions {
  vehicles: { id: string; plateNo: string; status: string; licence: LicenceState }[];
  drivers: { id: string; name: string; licence: LicenceState }[];
  maxStops: number;
  today: Iso;
}

export interface TripListRow {
  id: string;
  tripCode: string;
  plannedDate: Iso;
  status: TripStatus;
  vehiclePlate: string;
  driverName: string;
  stopsDone: number;
  stopsTotal: number;
}

export interface TripDetailStop {
  id: string;
  order: number;
  facility: FacilityRef;
  status: "PENDING" | "ARRIVED" | "COLLECTED" | "COLLECTED_OVERRIDE" | "SKIPPED";
  collectionMethod: "OTP" | "IN_APP" | "OVERRIDE" | null;
  arrivedAt: Iso | null;
  completedAt: Iso | null;
  distanceM: number | null;
  geofenceOk: boolean | null;
  skipReason: string | null;
  overrideReason: string | null;
  expectedContainers: number;
  scannedContainers: number;
  wasteCodes: string[];
}

export interface TripDetail extends TripListRow {
  vehicleId: string;
  driverId: string;
  startedAt: Iso | null;
  completedAt: Iso | null;
  cancelReason: string | null;
  stops: TripDetailStop[];
}

/** /admin/certificates: every certificate, including PENDING / FAILED with the generation error. */
export interface AdminCertificateRow {
  id: string;
  certificateNo: string;
  status: CertificateStatus;
  facilityName: string;
  wasteCode: string;
  issuedOn: string | null;
  attempts: number;
  lastError: string | null;
  revokedReason: string | null;
}
