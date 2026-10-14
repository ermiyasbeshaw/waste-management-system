import type { CollectionMethod, StopStatus, TripStatus } from "@/lib/statuses";
import type { FacilityRef, Iso } from "./shared";

export interface StopCard {
  id: string;
  order: number;
  facility: FacilityRef & { address: string };
  status: StopStatus;
  expectedContainers: number;
  weightKg: number;
  categories: { name: string; colourHex: string; count: number }[];
  arrivedAt: Iso | null;
  /** Set when the stop was completed (OTP, in-app confirmation or admin override). */
  collectionMethod: CollectionMethod | null;
  /** Containers scanned at this stop so far (evidence; the stop completes only when all are scanned). */
  scannedContainers: number;
  /** Expiry of the active (unexpired) pickup code, or null. */
  otpExpiresAt: Iso | null;
}

export interface DriverTrip {
  id: string;
  tripCode: string;
  /** date */
  plannedDate: Iso;
  status: TripStatus;
  vehiclePlate: string;
  stopsCompleted: number;
  stopsTotal: number;
  containersTotal: number;
  weightKgTotal: number;
  startedAt: Iso | null;
  stops: StopCard[];
}

export interface DriverDashboardData {
  driver: { id: string; name: string; licenseNo: string; vehiclePlate: string | null };
  activeTrip: DriverTrip | null;
  upcomingTrips: DriverTrip[];
}
