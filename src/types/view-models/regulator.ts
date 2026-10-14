import type { CategoryRef, FacilityRef, Iso } from "./shared";

export interface AuditRow {
  id: string;
  /** Position in the hash chain (also the paging cursor). */
  seq: number;
  at: Iso;
  /** null for system jobs. */
  actorName: string | null;
  role: string | null;
  action: string;
  facilityName: string | null;
  summary: string;
  ip: string | null;
}

export interface RegulatorFilters {
  /** Facility code (e.g. DD-REF-001) or "ALL". */
  facilityCode: string;
  /** Category code or "ALL". */
  categoryCode: string;
}

export interface RegulatorFilterOptions {
  facilities: FacilityRef[];
  categories: CategoryRef[];
}

export interface RegulatorKpis {
  totalKg: number;
  totalContainers: number;
  facilitiesCount: number;
  certificatesIssuedCount: number;
  certificatesRevokedCount: number;
}

export interface WeeklyVolume {
  weekLabel: string;
  kg: number;
  containers: number;
}

export type FacilityVolume = FacilityRef & { kg: number; containers: number };

/** One page of a list, newest first; `nextCursor` is null on the last page. */
export interface Page<T> {
  rows: T[];
  nextCursor: string | null;
}

/** Gate 6.5: pickup evidence for the regulator — overrides and arrival geofence results (last 90 days). */
export interface RegulatorEvidence {
  overrides: { id: string; tripCode: string; facilityName: string; reason: string; at: string }[];
  arrivals: {
    id: string;
    tripCode: string;
    facilityName: string;
    arrivedAt: string;
    distanceM: number | null;
    /** null = no recent GPS point at arrival ("no GPS"). */
    geofenceOk: boolean | null;
  }[];
}
