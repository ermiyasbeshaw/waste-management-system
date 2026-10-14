"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addStockLineAction } from "@/app/(desk)/hospital/stock/actions";
import { Field, FormError, inputClass, primaryButtonClass } from "@/components/shared/form-field";

/** Add one stock line by hand (CLAUDE.md §12). */
const EMPTY = {
  item: "",
  strength: "",
  form: "",
  batch: "",
  quantity: "",
  unit: "",
  expiryDate: "",
};

export function StockLineForm() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(EMPTY);
  const [fields, setFields] = useState<Record<string, string[] | undefined> | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addStockLineAction(v);
      if (!r.ok) {
        setFields(r.fields);
        setMessage(r.message);
        return;
      }
      setDone(`${v.item} (${v.batch}) added.`);
      setV(EMPTY);
      setFields(undefined);
      setMessage(null);
      setOpen(false);
    });
  };
  const f = (k: keyof typeof EMPTY, label: string, type = "text") => (
    <Field id={`stock-${k}`} label={label} error={fields?.[k]?.[0]}>
      <input
        id={`stock-${k}`}
        type={type}
        value={v[k]}
        onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))}
        className={inputClass}
      />
    </Field>
  );

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-white/[0.08] text-zinc-100"
        >
          Add a line by hand
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
      onSubmit={submit}
      className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 grid gap-3 md:grid-cols-4"
    >
      {f("item", "Item")}
      {f("strength", "Strength (optional)")}
      {f("form", "Form (optional)")}
      {f("batch", "Batch")}
      {f("quantity", "Quantity", "number")}
      {f("unit", "Unit")}
      {f("expiryDate", "Expiry date", "date")}
      <div className="md:col-span-4 space-y-3">
        <FormError message={message} />
        <div className="flex gap-3">
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Saving…" : "Add line"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-zinc-400">
            Close
          </button>
        </div>
      </div>
    </form>
  );
}
