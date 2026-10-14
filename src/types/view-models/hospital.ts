import type { WasteStatus } from "@/types/waste";
import type { CategoryRef, FacilityRef, Iso } from "./shared";

export interface WasteRow {
  id: string;
  wasteCode: string;
  category: CategoryRef;
  containerCount: number;
  weightKg: number;
  status: WasteStatus;
  createdAt: Iso;
}

export interface HospitalFacility extends FacilityRef {
  address: string;
  /** Hospital users with a verified phone who receive pickup OTPs; 0 = the facility cannot be scheduled. */
  otpRecipientCount: number;
}

export interface HospitalKpis {
  waitingPickupCount: number;
  waitingPickupKg: number;
  scheduledCount: number;
  inTransitCount: number;
  disposedThisMonthCount: number;
  disposedThisMonthKg: number;
}

/** "Truck at the door" (CLAUDE.md §6): an ARRIVED stop at the user's own facility. */
export interface ActiveHandover {
  stopId: string;
  tripCode: string;
  vehiclePlate: string;
  driverName: string;
  arrivedAt: Iso;
  expectedContainers: number;
  scannedContainers: number;
  /** An unexpired pickup code was sent by SMS. */
  otpActive: boolean;
  otpExpiresAt: Iso | null;
}
