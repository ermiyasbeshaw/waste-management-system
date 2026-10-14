import type { StopStatus, TripStatus } from "@/lib/statuses";

/** Route replay of one trip (Gate 4.5): the stored GPS track plus the stops with their arrival evidence. */
export interface TripReplay {
  id: string;
  tripCode: string;
  status: TripStatus;
  vehiclePlate: string;
  driverName: string;
  startedAt: string | null;
  endedAt: string | null;
  points: { lat: number; lng: number; speedKmh: number | null; recordedAt: string }[];
  /** True when the track had more points than shown and was thinned evenly. */
  thinned: boolean;
  stops: {
    order: number;
    facilityName: string;
    lat: number | null;
    lng: number | null;
    status: StopStatus;
    arrivedAt: string | null;
    arrivalDistanceM: number | null;
    /** null = no recent GPS point at arrival ("no GPS"). */
    geofenceOk: boolean | null;
  }[];
}

/** A trip that can be replayed (it has started). */
export interface ReplayableTrip {
  id: string;
  tripCode: string;
  status: TripStatus;
  plannedDate: string;
  vehiclePlate: string;
  points: number;
}
