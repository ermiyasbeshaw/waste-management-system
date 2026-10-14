"use client";

import { useState, useTransition } from "react";
import { createContractAction, updateContractAction } from "@/app/(desk)/admin/contracts/actions";
import { Field, FormError, inputClass, primaryButtonClass } from "@/components/shared/form-field";
import type { ContractRow, FacilityRef } from "@/types/view-models";

/**
 * Contracts (Gate 6.1, super_admin): create a contract (code CT-YYYY-NNNN; one per facility at a time) and change a
 * running one (end date, monthly fee for future invoices, terms). Fees are typed in ETB and stored in santim.
 */

type Fields = Record<string, string[] | undefined> | undefined;
const err = (f: Fields, k: string) => f?.[k]?.[0];
const etb = (santim: number) => (santim / 100).toFixed(2);

export function NewContractForm({ facilities }: { facilities: FacilityRef[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    facilityCode: "",
    startDate: "",
    endDate: "",
    monthlyFeeEtb: "",
    terms: "",
  });
  const [fields, setFields] = useState<Fields>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button type="button" className={primaryButtonClass} onClick={() => setOpen(true)}>
          New contract
        </button>
        {done && (
          <p role="status" className="text-sm text-emerald-300">
            {done}
          </p>
        )}
      </div>
    );
  }
  return (
    <form
      className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 grid gap-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createContractAction(form);
          if (!r.ok) {
            setFields(r.fields);
            setMessage(r.message);
            return;
          }
          setDone(`Contract ${r.data.contractCode} created.`);
          setOpen(false);
          setFields(undefined);
          setMessage(null);
          setForm({ facilityCode: "", startDate: "", endDate: "", monthlyFeeEtb: "", terms: "" });
        });
      }}
    >
      <Field id="ct-facility" label="Facility" error={err(fields, "facilityCode")}>
        <select
          id="ct-facility"
          value={form.facilityCode}
          onChange={set("facilityCode")}
          className={inputClass}
        >
          <option value="">Choose…</option>
          {facilities.map((f) => (
            <option key={f.id} value={f.code}>
              {f.name} ({f.code})
            </option>
          ))}
        </select>
      </Field>
      <Field id="ct-fee" label="Monthly fee (ETB, before VAT)" error={err(fields, "monthlyFeeEtb")}>
        <input
          id="ct-fee"
          inputMode="decimal"
          value={form.monthlyFeeEtb}
          onChange={set("monthlyFeeEtb")}
          className={inputClass}
        />
      </Field>
      <Field id="ct-start" label="Start date" error={err(fields, "startDate")}>
        <input
          id="ct-start"
          type="date"
          value={form.startDate}
          onChange={set("startDate")}
          className={inputClass}
        />
      </Field>
      <Field
        id="ct-end"
        label="End date (first day no longer covered)"
        error={err(fields, "endDate")}
      >
        <input
          id="ct-end"
          type="date"
          value={form.endDate}
          onChange={set("endDate")}
          className={inputClass}
        />
      </Field>
      <div className="md:col-span-2">
        <Field id="ct-terms" label="Terms (optional)" error={err(fields, "terms")}>
          <textarea
            id="ct-terms"
            rows={2}
            value={form.terms}
            onChange={set("terms")}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="md:col-span-2 space-y-3">
        <FormError message={message} />
        <div className="flex gap-3">
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Saving…" : "Create contract"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-[44px] px-4 rounded-xl text-sm text-zinc-300"
          >
            Close
          </button>
        </div>
      </div>
    </form>
  );
}

export function EditContract({ contract }: { contract: ContractRow }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    endDate: contract.endDate,
    monthlyFeeEtb: etb(contract.monthlyFeeSantim),
    terms: contract.terms ?? "",
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (contract.status === "EXPIRED")
    return <span className="text-[11px] text-zinc-500">Ended</span>;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold bg-white/[0.06] text-zinc-200"
      >
        Change
      </button>
    );
  }
  return (
    <div className="space-y-1.5 min-w-[200px]">
      <input
        aria-label="End date"
        type="date"
        value={form.endDate}
        onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
        className={inputClass}
      />
      <input
        aria-label="Monthly fee (ETB)"
        inputMode="decimal"
        value={form.monthlyFeeEtb}
        onChange={(e) => setForm((f) => ({ ...f, monthlyFeeEtb: e.target.value }))}
        className={inputClass}
      />
      <input
        aria-label="Terms"
        value={form.terms}
        onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
        className={inputClass}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold bg-emerald-500 text-black disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const r = await updateContractAction(contract.id, form);
              setMessage(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.message });
              if (r.ok) setOpen(false);
            })
          }
        >
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-zinc-400">
          Close
        </button>
      </div>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-[11px] ${message.ok ? "text-emerald-300" : "text-rose-300"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
