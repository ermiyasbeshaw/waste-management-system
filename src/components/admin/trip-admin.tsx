"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { formatDate, formatTime } from "@/lib/dates";
import { newIdempotencyKey, postCommand } from "@/lib/client/command";
import type { TripDetail, TripPlanningOptions, TripListRow } from "@/types/view-models";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type Column } from "@/components/shared/data-table";
import {
  FormError,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/shared/form-field";

/** /admin/trips list. */
export function TripsList({ rows }: { rows: TripListRow[] }) {
  const columns: Column<TripListRow>[] = [
    {
      key: "tripCode",
      header: "Trip",
      render: (t) => (
        <Link
          href={`/admin/trips/${t.id}`}
          className="font-mono font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
        >
          {t.tripCode}
        </Link>
      ),
    },
    {
      key: "plannedDate",
      header: "Date",
      render: (t) => <span className="font-mono text-zinc-300">{formatDate(t.plannedDate)}</span>,
    },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} size="sm" /> },
    {
      key: "vehiclePlate",
      header: "Vehicle",
      render: (t) => <span className="font-mono">{t.vehiclePlate}</span>,
    },
    { key: "driverName", header: "Driver", render: (t) => <span>{t.driverName}</span> },
    {
      key: "stopsDone",
      header: "Stops",
      render: (t) => (
        <span className="font-mono">
          {t.stopsDone} / {t.stopsTotal}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      title="Trips"
      description="Open trips and the last 14 days"
      data={rows}
      columns={columns}
      searchKey="tripCode"
      pageSize={20}
    />
  );
}

/** One idempotent admin command with a reason prompt. */
function useCommand() {
  const router = useRouter();
  const keys = useRef(new Map<string, string>());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: string, url: string, body: unknown) => {
    if (!keys.current.has(action)) keys.current.set(action, newIdempotencyKey());
    setBusy(action);
    setError(null);
    const r = await postCommand(url, body, keys.current.get(action));
    setBusy(null);
    if (r.status !== 0) keys.current.delete(action);
    if (r.ok) router.refresh();
    else setError(r.message);
    return r.ok;
  };
  return { run, busy, error };
}

function ReasonAction({
  label,
  onConfirm,
  busy,
  danger = true,
}: {
  label: string;
  onConfirm: (reason: string) => Promise<boolean>;
  busy: boolean;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={danger ? dangerButtonClass : secondaryButtonClass}
      >
        {label}…
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      <label className="sr-only" htmlFor={`reason-${label}`}>
        Reason
      </label>
      <input
        id={`reason-${label}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Written reason (required)"
        className={`${inputClass} flex-1 min-w-[200px]`}
      />
      <button
        type="button"
        disabled={busy || reason.trim().length < 3}
        onClick={async () => {
          if (await onConfirm(reason)) setOpen(false);
        }}
        className={dangerButtonClass}
      >
        {busy ? "…" : label}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
        Back
      </button>
    </div>
  );
}

const METHOD: Record<string, string> = {
  OTP: "pickup code",
  IN_APP: "in-app by the hospital",
  OVERRIDE: "admin override",
};

/** /admin/trips/[id]: stops with evidence, cancel / reassign / skip / override, manifest. */
export function TripAdmin({ trip, options }: { trip: TripDetail; options: TripPlanningOptions }) {
  const { run, busy, error } = useCommand();
  const [vehicleId, setVehicleId] = useState(trip.vehicleId);
  const [driverId, setDriverId] = useState(trip.driverId);
  const open = trip.status === "PLANNED" || trip.status === "IN_PROGRESS";

  return (
    <div className="space-y-4">
      <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white font-mono">{trip.tripCode}</h2>
            <p className="text-sm text-zinc-400">
              {formatDate(trip.plannedDate)} · {trip.vehiclePlate} · {trip.driverName}
              {trip.startedAt && ` · started ${formatTime(trip.startedAt)}`}
            </p>
            {trip.cancelReason && (
              <p className="text-sm text-rose-300">Cancelled: {trip.cancelReason}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={trip.status} />
            <a
              href={`/api/trips/${trip.id}/manifest`}
              target="_blank"
              rel="noopener"
              className={`${secondaryButtonClass} gap-2`}
            >
              <FileText className="w-4 h-4" aria-hidden="true" /> Manifest (PDF)
            </a>
          </div>
        </div>
        <FormError message={error} />
        {trip.status === "PLANNED" && (
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-white/[0.05]">
            <div>
              <label htmlFor="re-vehicle" className="block text-xs text-zinc-400">
                Vehicle
              </label>
              <select
                id="re-vehicle"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className={inputClass}
              >
                {options.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="re-driver" className="block text-xs text-zinc-400">
                Driver
              </label>
              <select
                id="re-driver"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className={inputClass}
              >
                {options.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={
                busy !== null || (vehicleId === trip.vehicleId && driverId === trip.driverId)
              }
              onClick={() =>
                run("reassign", `/api/trips/${trip.id}/reassign`, {
                  ...(vehicleId !== trip.vehicleId ? { vehicleId } : {}),
                  ...(driverId !== trip.driverId ? { driverId } : {}),
                })
              }
              className={secondaryButtonClass}
            >
              {busy === "reassign" ? "Reassigning…" : "Reassign"}
            </button>
          </div>
        )}
        {open && (
          <div className="pt-2 border-t border-white/[0.05]">
            <ReasonAction
              label="Cancel trip"
              busy={busy === "cancel"}
              onConfirm={(reason) => run("cancel", `/api/trips/${trip.id}/cancel`, { reason })}
            />
          </div>
        )}
      </section>

      <ol className="space-y-3">
        {trip.stops.map((s) => (
          <li
            key={s.id}
            className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-white font-semibold">
                <span className="font-mono text-amber-300">#{s.order}</span> {s.facility.name}{" "}
                <span className="font-mono text-xs text-zinc-500">{s.facility.code}</span>
              </p>
              <StatusBadge status={s.status} size="sm" />
            </div>
            <p className="text-xs text-zinc-400">
              Waste: <span className="font-mono">{s.wasteCodes.join(", ") || "—"}</span> · scanned{" "}
              {s.scannedContainers} of {s.expectedContainers}
            </p>
            {s.arrivedAt && (
              <p className="text-xs text-zinc-400">
                Arrived {formatTime(s.arrivedAt)} ·{" "}
                {s.geofenceOk === null ? (
                  <StatusBadge status="NO_GPS" size="sm" />
                ) : s.geofenceOk ? (
                  <span className="text-emerald-400">inside geofence ({s.distanceM} m)</span>
                ) : (
                  <span className="text-amber-400">OUTSIDE geofence ({s.distanceM} m)</span>
                )}
              </p>
            )}
            {s.collectionMethod && (
              <p className="text-xs text-zinc-300">
                Confirmed by {METHOD[s.collectionMethod]}
                {s.completedAt && ` at ${formatTime(s.completedAt)}`}
              </p>
            )}
            {s.overrideReason && (
              <p className="text-xs text-amber-300">Override reason: {s.overrideReason}</p>
            )}
            {s.skipReason && <p className="text-xs text-rose-300">Skipped: {s.skipReason}</p>}
            {trip.status === "IN_PROGRESS" &&
              (s.status === "PENDING" || s.status === "ARRIVED") && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {s.status === "ARRIVED" && (
                    <ReasonAction
                      label="Override pickup"
                      busy={busy === `override-${s.id}`}
                      onConfirm={(reason) =>
                        run(`override-${s.id}`, `/api/stops/${s.id}/override`, { reason })
                      }
                    />
                  )}
                  <ReasonAction
                    label="Skip stop"
                    danger={false}
                    busy={busy === `skip-${s.id}`}
                    onConfirm={(reason) =>
                      run(`skip-${s.id}`, `/api/stops/${s.id}/skip`, { reason })
                    }
                  />
                </div>
              )}
          </li>
        ))}
      </ol>
      <p className="text-xs text-zinc-500">
        An override still requires every container to be scanned; it is logged and visible to EFDA.
      </p>
    </div>
  );
}
