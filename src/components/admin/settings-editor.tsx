"use client";

import { useState, useTransition } from "react";
import { updateSettingAction } from "@/app/(desk)/admin/settings/actions";
import { inputClass } from "@/components/shared/form-field";

/** Settings (CLAUDE.md §7): one row per key; numbers, text or on/off. Each save is validated and audited. */

const LABELS: Record<string, string> = {
  otp_expiry_minutes: "Pickup code valid for (minutes)",
  otp_max_attempts: "Wrong code attempts before the code is locked",
  otp_resend_cooldown_seconds: "Wait before a new code can be sent (seconds)",
  otp_max_per_stop: "Pickup codes per stop (then override only)",
  geofence_radius_m: "Geofence radius (metres, flag only)",
  tracker_silent_minutes: "Tracker silent alert after (minutes)",
  tracker_max_clock_skew_minutes: "Tracker clock may run ahead by (minutes)",
  max_trip_stops: "Maximum stops per trip",
  overdue_pickup_days: "Waste waiting is overdue after (days)",
  contract_expiry_warning_days: "Contract expiry warning (days)",
  license_expiry_warning_days: "Licence expiry warning (days)",
  vat_rate_percent: "VAT for new invoices (%)",
  outbox_max_attempts: "SMS / email send attempts before FAILED",
  label_amharic_enabled: "Amharic text on labels",
  invoice_due_days: "Invoice due after (days)",
  system_name: "System name",
  region_focus: "Region",
  expiry_alert_days: "Medicine expiry alerts: days before expiry (comma-separated)",
};

function Row({ k, value, locked }: { k: string; value: unknown; locked: boolean }) {
  const isBool = typeof value === "boolean";
  const isNumber = typeof value === "number";
  const isList = Array.isArray(value);
  const [draft, setDraft] = useState(
    isList ? (value as unknown[]).join(", ") : String(value ?? "")
  );
  const [checked, setChecked] = useState(value === true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const v = isBool
        ? checked
        : isNumber
          ? Number(draft)
          : isList
            ? draft
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
                .map(Number)
            : draft;
      const r = await updateSettingAction(k, v);
      setMessage(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.message });
    });
  const id = `setting-${k}`;
  return (
    <li className="py-3 grid gap-2 md:grid-cols-[1fr_220px_auto] md:items-center">
      <label htmlFor={id} className="text-sm text-zinc-200">
        {LABELS[k] ?? k}
        <span className="block font-mono text-[10px] text-zinc-500">{k}</span>
      </label>
      {isBool ? (
        <input
          id={id}
          type="checkbox"
          disabled={locked}
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="h-5 w-5"
        />
      ) : (
        <input
          id={id}
          inputMode={isNumber ? "decimal" : "text"}
          disabled={locked}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={inputClass}
        />
      )}
      <div className="flex items-center gap-2">
        {locked ? (
          <span className="text-[11px] text-zinc-500">
            Not available yet (needs wording and font)
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="min-h-[36px] px-3 rounded-lg text-xs font-semibold bg-emerald-500 text-black disabled:opacity-50"
          >
            Save
          </button>
        )}
        {message && (
          <span
            role={message.ok ? "status" : "alert"}
            className={`text-[11px] ${message.ok ? "text-emerald-300" : "text-rose-300"}`}
          >
            {message.text}
          </span>
        )}
      </div>
    </li>
  );
}

export function SettingsEditor({
  rows,
}: {
  rows: { key: string; value: unknown; locked: boolean }[];
}) {
  return (
    <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-2">
      <h2 className="text-base font-semibold text-white">Settings</h2>
      <p className="text-xs text-zinc-400">
        Business values used by the whole system. Changes apply from now on (existing invoices keep
        their VAT rate and due date) and are recorded in the audit log.
      </p>
      <ul className="divide-y divide-white/[0.05]">
        {rows.map((r) => (
          <Row key={r.key} k={r.key} value={r.value} locked={r.locked} />
        ))}
      </ul>
    </section>
  );
}
