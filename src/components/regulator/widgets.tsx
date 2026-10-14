import Link from "next/link";
import { Activity, AlertTriangle, Building2, FileCheck } from "lucide-react";
import { KpiCard } from "@/components/shared/kpi-card";
import { LiveMap } from "@/components/maps/live-map";
import { RouteReplay } from "@/components/maps/route-replay";
import { getReplayableTrips } from "@/server/queries/tracking";
import { getRegulatorEvidence } from "@/server/queries/regulator";
import { formatDateTime } from "@/lib/dates";
import {
  getRegulatorAuditPage,
  getRegulatorCertificatesPage,
  getRegulatorFacilityVolumes,
  getRegulatorKpis,
  getRegulatorMap,
  getRegulatorWeekly,
} from "@/server/queries/regulator";
import type { RegulatorFilters } from "@/types/view-models";
import { AuditLedgerTable, CertificatesRegistryTable, FacilityLeagueTable } from "./tables";
import { WeeklyTrendChart } from "./weekly-trend-chart";

/**
 * Regulator dashboard widgets (CLAUDE.md §8): one async Server Component per widget, each loading its own data;
 * the pages wrap each one in <Suspense> with a skeleton so a slow query never blocks the others.
 */

const kg = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg`;

export async function RegulatorKpisWidget({ filters }: { filters: RegulatorFilters }) {
  const k = await getRegulatorKpis(filters.facilityCode, filters.categoryCode);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Monitored Biohazard Volume"
        value={kg(k.totalKg)}
        subtitle={`${k.totalContainers} registered containers (cancelled excluded)`}
        icon={Activity}
        color="purple"
      />
      <KpiCard
        title="Licensed Facilities Monitored"
        value={k.facilitiesCount}
        subtitle="Active hospitals, clinics & pharmacies"
        icon={Building2}
        color="blue"
      />
      <KpiCard
        title="Valid Destruction Certificates"
        value={k.certificatesIssuedCount}
        subtitle="Issued and publicly verifiable"
        icon={FileCheck}
        color="emerald"
      />
      <KpiCard
        title="Revoked Certificates"
        value={k.certificatesRevokedCount}
        subtitle="No longer valid; history kept"
        icon={AlertTriangle}
        color="rose"
      />
    </div>
  );
}

export async function WeeklyTrendWidget({ filters }: { filters: RegulatorFilters }) {
  const weekly = await getRegulatorWeekly(filters.facilityCode, filters.categoryCode);
  return <WeeklyTrendChart weekly={weekly} />;
}

export async function FacilityVolumesWidget({ filters }: { filters: RegulatorFilters }) {
  const rows = await getRegulatorFacilityVolumes(filters.facilityCode, filters.categoryCode);
  return <FacilityLeagueTable rows={rows} />;
}

/** "Older entries" link that keeps the current filters and moves the cursor. */
function OlderLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex justify-end">
      <Link
        href={href}
        className="min-h-[44px] inline-flex items-center px-4 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08]"
      >
        {label} →
      </Link>
    </div>
  );
}

function withParams(path: string, params: Record<string, string | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && v !== "ALL") qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export async function AuditLedgerWidget({
  filters,
  cursor,
}: {
  filters: RegulatorFilters;
  cursor: string | null;
}) {
  const page = await getRegulatorAuditPage(cursor);
  return (
    <div className="space-y-3">
      <AuditLedgerTable rows={page.rows} />
      {page.nextCursor && (
        <OlderLink
          label="Older entries"
          href={withParams("/regulator/audit", {
            facility: filters.facilityCode,
            category: filters.categoryCode,
            before: page.nextCursor,
          })}
        />
      )}
    </div>
  );
}

export async function CertificatesWidget({
  filters,
  cursor,
}: {
  filters: RegulatorFilters;
  cursor: string | null;
}) {
  const page = await getRegulatorCertificatesPage(
    filters.facilityCode,
    filters.categoryCode,
    cursor
  );
  return (
    <div className="space-y-3">
      <CertificatesRegistryTable rows={page.rows} />
      {page.nextCursor && (
        <OlderLink
          label="Older certificates"
          href={withParams("/regulator/certificates", {
            facility: filters.facilityCode,
            category: filters.categoryCode,
            after: page.nextCursor,
          })}
        />
      )}
    </div>
  );
}

export async function RouteMapWidget() {
  const map = await getRegulatorMap();
  return (
    <div className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">Live Route & Chain-of-Custody Radar</h3>
      <p className="text-xs text-zinc-400">
        Trips in progress: latest GPS position of each vehicle and its stops (refreshed every 30 s).
      </p>
      <LiveMap initial={map} height="480px" />
    </div>
  );
}

/** Route replay of a started trip: stored GPS track and arrival evidence (read-only). */
export async function RouteReplayWidget({ tripId }: { tripId: string | null }) {
  const trips = await getReplayableTrips(30);
  return (
    <div className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">Route replay</h3>
      <RouteReplay trips={trips} initialTripId={tripId} height="420px" />
    </div>
  );
}

/** Gate 6.5: override and geofence evidence of the last 90 days (read-only). */
export async function EvidenceWidget() {
  const e = await getRegulatorEvidence();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Handover overrides (90 days)</h3>
        <p className="text-xs text-zinc-400">
          Pickups completed by the Super Administrator without the code.
        </p>
        {e.overrides.length === 0 ? (
          <p className="text-xs text-zinc-500">None.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05] text-xs">
            {e.overrides.map((o) => (
              <li key={o.id} className="py-2">
                <p className="text-zinc-200">
                  <span className="font-mono">{o.tripCode}</span> · {o.facilityName}
                </p>
                <p className="text-zinc-400">{o.reason}</p>
                <p className="text-zinc-500 font-mono">{formatDateTime(o.at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">
          Arrivals outside the geofence or without GPS (90 days)
        </h3>
        <p className="text-xs text-zinc-400">A flag only: an arrival is never blocked.</p>
        {e.arrivals.length === 0 ? (
          <p className="text-xs text-zinc-500">None.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05] text-xs">
            {e.arrivals.map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap justify-between gap-2">
                <span className="text-zinc-200">
                  <span className="font-mono">{a.tripCode}</span> · {a.facilityName}
                </span>
                <span className={a.geofenceOk === false ? "text-amber-300" : "text-zinc-400"}>
                  {a.geofenceOk === null ? "no GPS" : `${a.distanceM ?? "?"} m away (outside)`}
                </span>
                <span className="w-full text-zinc-500 font-mono">
                  {formatDateTime(a.arrivedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
