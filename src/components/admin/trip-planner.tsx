"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { TripPlanningOptions, WaitingFacility } from "@/types/view-models";
import { createTripAction } from "@/app/(desk)/admin/trips/actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Field, FormError, inputClass, primaryButtonClass } from "@/components/shared/form-field";

const LICENCE_NOTE: Record<string, string> = {
  EXPIRED: " — licence EXPIRED",
  EXPIRING: " — licence expiring soon",
  NONE: " — no licence on record",
  VALID: "",
};

/**
 * Trip builder (CLAUDE.md §6, architecture §8.2): pick date, vehicle, driver and facilities in visiting order from
 * the waiting list (oldest / overdue first). Each stop takes all of the facility's waiting waste. The server checks
 * readiness, licences, availability and the stop limit again.
 */
export function TripPlanner({
  waiting,
  options,
}: {
  waiting: WaitingFacility[];
  options: TripPlanningOptions;
}) {
  const router = useRouter();
  const [date, setDate] = useState(options.today);
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [stops, setStops] = useState<WaitingFacility[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = (f: WaitingFacility) =>
    setStops((s) => (s.some((x) => x.code === f.code) ? s : [...s, f]));
  const move = (i: number, d: -1 | 1) =>
    setStops((s) => {
      const next = [...s];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const totals = stops.reduce(
    (t, f) => ({ containers: t.containers + f.containers, kg: t.kg + f.kg }),
    { containers: 0, kg: 0 }
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await createTripAction({
      plannedDate: date,
      vehicleId,
      driverId,
      stops: stops.map((s) => ({ facilityCode: s.code })),
    });
    setBusy(false);
    if (r.ok) router.push(`/admin/trips/${r.data.id}`);
    else setError(r.message);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Waiting list (oldest first)</h2>
        {waiting.length === 0 && (
          <p className="text-sm text-zinc-500">No waste is waiting for pickup.</p>
        )}
        <ul className="space-y-2">
          {waiting.map((f) => {
            const chosen = stops.some((s) => s.code === f.code);
            return (
              <li
                key={f.code}
                className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#161622] border border-white/[0.05]"
              >
                <div className="min-w-0">
                  <p className="text-white font-medium">
                    {f.name} <span className="font-mono text-xs text-zinc-500">{f.code}</span>
                  </p>
                  <p className="text-xs text-zinc-400">
                    {f.wasteCount} record(s) · {f.containers} container(s) ·{" "}
                    {f.kg.toLocaleString("en-US")} kg · waiting{" "}
                    <span className={f.overdue ? "text-rose-400 font-semibold" : ""}>
                      {f.oldestDays} day(s){f.overdue ? " — overdue" : ""}
                    </span>
                  </p>
                </div>
                {f.ready ? (
                  <button
                    type="button"
                    onClick={() => add(f)}
                    disabled={chosen || stops.length >= options.maxStops}
                    className="min-h-[44px] px-3 rounded-xl text-sm font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 disabled:opacity-40 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" /> {chosen ? "Added" : "Add stop"}
                  </button>
                ) : (
                  <StatusBadge status="NOT_READY" size="sm" />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">New trip</h2>
        <FormError message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field id="plannedDate" label="Date">
            <input
              id="plannedDate"
              type="date"
              min={options.today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="vehicleId" label="Vehicle">
            <select
              id="vehicleId"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose…</option>
              {options.vehicles.map((v) => (
                <option key={v.id} value={v.id} disabled={v.licence === "EXPIRED"}>
                  {v.plateNo}
                  {LICENCE_NOTE[v.licence]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="driverId" label="Driver">
            <select
              id="driverId"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose…</option>
              {options.drivers.map((d) => (
                <option key={d.id} value={d.id} disabled={d.licence === "EXPIRED"}>
                  {d.name}
                  {LICENCE_NOTE[d.licence]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div>
          <p className="text-sm text-zinc-300 mb-2">
            Stops in visiting order ({stops.length} of at most {options.maxStops})
          </p>
          {stops.length === 0 && (
            <p className="text-sm text-zinc-500">Add facilities from the waiting list.</p>
          )}
          <ol className="space-y-2">
            {stops.map((s, i) => (
              <li
                key={s.code}
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#161622] border border-white/[0.05]"
              >
                <span className="text-sm text-white">
                  <strong className="font-mono text-amber-300">#{i + 1}</strong> {s.name}
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${s.name} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="w-10 h-10 grid place-items-center rounded-lg bg-white/[0.05] disabled:opacity-30"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${s.name} down`}
                    disabled={i === stops.length - 1}
                    onClick={() => move(i, 1)}
                    className="w-10 h-10 grid place-items-center rounded-lg bg-white/[0.05] disabled:opacity-30"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${s.name}`}
                    onClick={() => setStops((x) => x.filter((y) => y.code !== s.code))}
                    className="w-10 h-10 grid place-items-center rounded-lg bg-rose-500/10 text-rose-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {stops.length > 0 && (
            <p className="text-xs text-zinc-400 mt-2">
              Total: {totals.containers} container(s), {totals.kg.toLocaleString("en-US")} kg
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !vehicleId || !driverId || stops.length === 0}
          className={primaryButtonClass}
        >
          {busy ? "Planning…" : "Plan trip"}
        </button>
        <p className="text-xs text-zinc-500">
          The driver gets an email; the waste becomes Scheduled.
        </p>
      </section>
    </div>
  );
}
