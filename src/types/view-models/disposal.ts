import type { ContainerStatus } from "@/types/waste";
import type { TripStatus } from "@/types/fleet";
import type { CategoryRef, FacilityRef, Iso } from "./shared";

export interface QueueContainer {
  id: string;
  containerCode: string;
  facility: FacilityRef;
  category: CategoryRef;
  status: ContainerStatus;
  receivedAt: Iso | null;
  /** Waste ID the container belongs to (weight is recorded per waste record). */
  wasteCode: string;
}

export interface ExceptionContainer {
  id: string;
  containerCode: string;
  facility: FacilityRef;
  status: ContainerStatus;
  reason: string | null;
  at: Iso;
}

export interface InboundTrip {
  id: string;
  tripCode: string;
  vehiclePlate: string;
  status: TripStatus;
  driverName: string;
  weightKgTotal: number;
  containersTotal: number;
}

export interface DisposalDashboardData {
  /** Name of the operator's DISPOSAL_SITE facility. */
  siteName: string;
  stats: {
    inboundCount: number;
    queueCount: number;
    destroyedTodayCount: number;
    destroyedTodayKg: number;
    missingCount: number;
    refusedCount: number;
    exceptionsCount: number;
  };
  inbound: InboundTrip[];
  queue: QueueContainer[];
  exceptions: ExceptionContainer[];
}

/** A collected container still on a truck (to check in at the site). */
export interface OnBoardContainer {
  containerCode: string;
  wasteCode: string;
  facilityName: string;
  tripCode: string;
  vehiclePlate: string;
}

/** Received waste waiting for destruction (or for closing when nothing was received). */
export interface ReadyWaste {
  id: string;
  wasteCode: string;
  facility: FacilityRef;
  categoryName: string;
  weightKg: number;
  receivedCount: number;
  exceptionCount: number;
}

export interface DisposalWork {
  onBoard: OnBoardContainer[];
  ready: ReadyWaste[];
  methods: { code: string; name: string }[];
}
