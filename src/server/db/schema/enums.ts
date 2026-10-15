import { pgEnum } from "drizzle-orm/pg-core";
import {
  CERTIFICATE_STATUSES,
  COLLECTION_METHODS,
  CONTAINER_STATUSES,
  CONTRACT_STATUSES,
  DRIVER_STATUSES,
  FACILITY_STATUSES,
  HANDOVER_STATUSES,
  INVOICE_STATUSES,
  MEDICINE_REQUEST_STATUSES,
  OTP_STATUSES,
  OUTBOX_STATUSES,
  STOP_STATUSES,
  TRIP_STATUSES,
  VEHICLE_STATUSES,
  WASTE_STATUSES,
} from "../../../lib/statuses";

/**
 * Postgres enums (CLAUDE.md §5). Status values come from `src/lib/statuses.ts` (shared with the UI). Status columns
 * change only through the Workflow Engine (Gate 2.6).
 */

export const userRole = pgEnum("user_role", [
  "super_admin",
  "hospital_admin",
  "hospital_staff",
  "driver",
  "disposal_operator",
  "efda_officer",
]);

export const facilityType = pgEnum("facility_type", [
  "REFERRAL_HOSPITAL",
  "GENERAL_HOSPITAL",
  "PRIMARY_HOSPITAL",
  "CLINIC",
  "PHARMACY",
  "DISPOSAL_SITE",
]);

export const facilityStatus = pgEnum("facility_status", FACILITY_STATUSES);

export const wasteStatus = pgEnum("waste_status", WASTE_STATUSES);

export const containerStatus = pgEnum("container_status", CONTAINER_STATUSES);

export const handoverStatus = pgEnum("handover_status", HANDOVER_STATUSES);

export const tripStatus = pgEnum("trip_status", TRIP_STATUSES);

export const stopStatus = pgEnum("stop_status", STOP_STATUSES);

export const collectionMethod = pgEnum("collection_method", COLLECTION_METHODS);

export const otpStatus = pgEnum("otp_status", OTP_STATUSES);

export const certificateStatus = pgEnum("certificate_status", CERTIFICATE_STATUSES);

export const invoiceStatus = pgEnum("invoice_status", INVOICE_STATUSES);

export const contractStatus = pgEnum("contract_status", CONTRACT_STATUSES);

export const vehicleStatus = pgEnum("vehicle_status", VEHICLE_STATUSES);

export const driverStatus = pgEnum("driver_status", DRIVER_STATUSES);

export const outboxStatus = pgEnum("outbox_status", OUTBOX_STATUSES);

export const medicineRequestStatus = pgEnum("medicine_request_status", MEDICINE_REQUEST_STATUSES);

export const outboxChannel = pgEnum("outbox_channel", ["SMS", "EMAIL"]);

export const licenseSubject = pgEnum("license_subject", ["VEHICLE", "DRIVER", "FACILITY", "SITE"]);

/** MoH colour codes for waste categories (text is always shown with the colour). */
export const MOH_COLOURS = ["YELLOW", "RED", "BLUE", "BROWN", "BLACK", "WHITE"] as const;

export type UserRoleValue = (typeof userRole.enumValues)[number];
export type FacilityTypeValue = (typeof facilityType.enumValues)[number];

/** Roles that must belong to a facility (DECISION v1.2 addendum: disposal_operator → the DISPOSAL_SITE). */
export const FACILITY_ROLES = ["hospital_admin", "hospital_staff", "disposal_operator"] as const;
/** Roles that must not have a facility. */
export const GLOBAL_ROLES = ["super_admin", "driver", "efda_officer"] as const;
/** Roles that may receive pickup OTPs (CLAUDE.md §6). */
export const OTP_RECIPIENT_ROLES = ["hospital_admin", "hospital_staff"] as const;
