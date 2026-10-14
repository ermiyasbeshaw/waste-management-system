"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { FleetData, LicenceState } from "@/types/view-models";
import type { ActionResult } from "@/server/api/action";
import {
  addLicenceAction,
  createDriverProfileAction,
  createTrackerAction,
  createVehicleAction,
  rotateTrackerTokenAction,
  setTrackerActiveAction,
  setVehicleStatusAction,
} from "@/app/(desk)/admin/fleet/actions";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/shared/form-field";

const LICENCE_TEXT: Record<LicenceState, { label: string; cls: string }> = {
  VALID: { label: "Licence valid", cls: "text-emerald-400" },
  EXPIRING: { label: "Licence expiring soon", cls: "text-amber-400" },
  EXPIRED: { label: "Licence EXPIRED — blocked", cls: "text-rose-400 font-semibold" },
  NONE: { label: "No licence on record", cls: "text-zinc-500" },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

/** Small add-form: collects named inputs, calls the action, shows errors per field. */
function AddForm({
  fields,
  submit,
  label,
  onDone,
}: {
  fields: {
    name: string;
    label: string;
    type?: string;
    options?: { value: string; label: string }[];
    required?: boolean;
  }[];
  submit: (values: Record<string, string>) => Promise<ActionResult<unknown>>;
  label: string;
  onDone?: (data: unknown) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const result = await submit(values);
    setBusy(false);
    if (result.ok) {
      form.reset();
      onDone?.(result.data);
      router.refresh();
    } else {
      setError(result.message);
      setFieldErrors(result.fields ?? {});
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <FormError message={error} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {fields.map((f) => {
          const id = `${label}-${f.name}`.replace(/\s+/g, "-").toLowerCase();
          const err = fieldErrors[f.name]?.[0];
          return (
            <div key={f.name} className="space-y-1">
              <label htmlFor={id} className="block text-xs font-medium text-zinc-300">
                {f.label}
              </label>
              {f.options ? (
                <select
                  id={id}
                  name={f.name}
                  className={inputClass}
                  aria-invalid={!!err}
                  defaultValue=""
                >
                  {!f.required && <option value="">—</option>}
                  {f.required && <option value="">Choose…</option>}
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  name={f.name}
                  type={f.type ?? "text"}
                  className={inputClass}
                  aria-invalid={!!err}
                />
              )}
              {err && <p className="text-xs text-rose-400">{err}</p>}
            </div>
          );
        })}
      </div>
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? "Saving…" : label}
      </button>
    </form>
  );
}

/** Shows a new tracker token exactly once (only its hash is stored). */
function TokenOnce({
  token,
  deviceId,
  onClose,
}: {
  token: string;
  deviceId: string;
  onClose: () => void;
}) {
  return (
    <div
      role="alert"
      className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
        <KeyRound className="w-4 h-4" aria-hidden="true" /> Token for {deviceId} — copy it now
      </p>
      <p className="text-xs text-zinc-300">
        It is shown only once and stored only as a hash. Configure it on the device; if lost, rotate
        the token.
      </p>
      <code className="block font-mono text-sm text-white bg-black/40 rounded-lg p-2 break-all">
        {token}
      </code>
      <button type="button" onClick={onClose} className={secondaryButtonClass}>
        I have copied it
      </button>
    </div>
  );
}

export function FleetManager({ data }: { data: FleetData }) {
  const router = useRouter();
  const [token, setToken] = useState<{ token: string; deviceId: string } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const plates = data.vehicles.map((v) => ({ value: v.plateNo, label: v.plateNo }));

  const run = async (p: Promise<ActionResult<unknown>>) => {
    setRowError(null);
    const r = await p;
    if (r.ok) router.refresh();
    else setRowError(r.message);
    return r;
  };

  return (
    <div className="space-y-6">
      <FormError message={rowError} />
      {token && <TokenOnce {...token} onClose={() => setToken(null)} />}

      <Section title="Vehicles">
        <ul className="space-y-2">
          {data.vehicles.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#161622] border border-white/[0.05]"
            >
              <div>
                <p className="font-mono font-bold text-white">{v.plateNo}</p>
                <p className="text-xs text-zinc-400">
                  {v.model ?? "—"} · {v.capacityKg.toLocaleString("en-US")} kg · tracker{" "}
                  {v.trackerDeviceId ?? "none"} ·{" "}
                  <span className={LICENCE_TEXT[v.licence].cls}>
                    {LICENCE_TEXT[v.licence].label}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={v.status} size="sm" />
                <label className="sr-only" htmlFor={`status-${v.id}`}>
                  Change status of {v.plateNo}
                </label>
                <select
                  id={`status-${v.id}`}
                  className={`${inputClass} w-auto`}
                  value=""
                  disabled={v.status === "IN_TRANSIT"}
                  onChange={(e) =>
                    e.target.value && run(setVehicleStatusAction(v.id, { status: e.target.value }))
                  }
                >
                  <option value="">Change status…</option>
                  <option value="ACTIVE">Active</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="OFFLINE">Offline</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
        <AddForm
          label="Add vehicle"
          submit={(v) => createVehicleAction(v)}
          fields={[
            { name: "plateNo", label: "Plate number" },
            { name: "model", label: "Model (optional)" },
            { name: "capacityKg", label: "Capacity (kg)", type: "number" },
          ]}
        />
      </Section>

      <Section title="Drivers">
        <ul className="space-y-2">
          {data.drivers.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#161622] border border-white/[0.05]"
            >
              <div>
                <p className="font-medium text-white">{d.name}</p>
                <p className="text-xs text-zinc-400">
                  {d.licenseNo} · default vehicle {d.defaultVehiclePlate ?? "—"} ·{" "}
                  <span className={LICENCE_TEXT[d.licence].cls}>
                    {LICENCE_TEXT[d.licence].label}
                  </span>
                </p>
              </div>
              <StatusBadge status={d.status} size="sm" />
            </li>
          ))}
        </ul>
        {data.driverCandidates.length > 0 ? (
          <AddForm
            label="Add driver profile"
            submit={(v) => createDriverProfileAction(v)}
            fields={[
              {
                name: "userId",
                label: "User with the driver role",
                required: true,
                options: data.driverCandidates.map((c) => ({ value: c.id, label: c.name })),
              },
              { name: "licenseNo", label: "Driving licence number" },
              { name: "defaultVehiclePlate", label: "Default vehicle", options: plates },
            ]}
          />
        ) : (
          <p className="text-xs text-zinc-500">
            Every user with the driver role has a profile. Give a user the driver role on the Users
            page first.
          </p>
        )}
      </Section>

      <Section title="GPS trackers">
        <ul className="space-y-2">
          {data.trackers.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#161622] border border-white/[0.05]"
            >
              <div>
                <p className="font-mono font-bold text-white">{t.deviceId}</p>
                <p className="text-xs text-zinc-400">
                  vehicle {t.vehiclePlate ?? "—"} · last seen{" "}
                  {t.lastSeenAt ? formatDateTime(t.lastSeenAt) : "never"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={t.active ? "ACTIVE" : "INACTIVE"} size="sm" />
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={async () => {
                    const r = await run(rotateTrackerTokenAction(t.id));
                    if (r.ok) setToken(r.data as { token: string; deviceId: string });
                  }}
                >
                  New token
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => run(setTrackerActiveAction(t.id, !t.active))}
                >
                  {t.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <AddForm
          label="Register tracker"
          submit={(v) => createTrackerAction(v)}
          onDone={(d) => setToken(d as { token: string; deviceId: string })}
          fields={[
            { name: "deviceId", label: "Device ID" },
            { name: "vehiclePlate", label: "Vehicle", options: plates },
          ]}
        />
      </Section>

      <Section title={`Licences (warning ${data.warningDays} days before expiry)`}>
        <ul className="space-y-2">
          {data.licences.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#161622] border border-white/[0.05]"
            >
              <div>
                <p className="text-white">
                  {l.subject}{" "}
                  <span className="text-xs text-zinc-500">({l.subjectType.toLowerCase()})</span>
                </p>
                <p className="text-xs text-zinc-400">
                  {l.kind} · <span className="font-mono">{l.number}</span>
                </p>
              </div>
              <span className={`text-xs font-mono ${LICENCE_TEXT[l.state].cls}`}>
                {l.state === "EXPIRED" ? "Expired" : "Expires"} {formatDate(l.expiresOn)}
              </span>
            </li>
          ))}
        </ul>
        <AddForm
          label="Add licence"
          submit={(v) => addLicenceAction(v)}
          fields={[
            {
              name: "subjectType",
              label: "For",
              required: true,
              options: [
                { value: "VEHICLE", label: "Vehicle" },
                { value: "DRIVER", label: "Driver" },
                { value: "FACILITY", label: "Facility" },
                { value: "SITE", label: "Disposal site" },
              ],
            },
            { name: "subjectRef", label: "Plate / driver licence no. / facility code" },
            { name: "kind", label: "Kind (e.g. Hazardous waste transport permit)" },
            { name: "number", label: "Licence number" },
            { name: "issuedOn", label: "Issued on (optional)", type: "date" },
            { name: "expiresOn", label: "Expires on", type: "date" },
          ]}
        />
      </Section>
    </div>
  );
}
