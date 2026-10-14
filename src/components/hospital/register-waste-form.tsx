"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, PackagePlus, Printer } from "lucide-react";
import {
  MAX_CONTAINERS_PER_REGISTRATION,
  registerWasteSchema,
  type RegisterWasteInput,
} from "@/lib/validation/waste";
import type { CategoryRef } from "@/types/view-models";
import type { RegisteredWaste } from "@/server/services/waste";
import { registerWasteAction } from "@/app/(desk)/hospital/waste/new/actions";

type FormValues = { categoryCode: string; containerCount: string; weightKg: string };

const newKey = () => crypto.randomUUID();

const inputClass =
  "w-full min-h-[44px] bg-[#161622] text-sm text-zinc-100 border border-white/[0.1] rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500/60 aria-[invalid=true]:border-rose-500/70";

/**
 * Waste registration form (CLAUDE.md §6). Validated here with the same zod schema the server uses; the server
 * validates again. One idempotency key per filled-in form, so a double click registers the waste once.
 */
export function RegisterWasteForm({ categories }: { categories: CategoryRef[] }) {
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [serverError, setServerError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<RegisteredWaste | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, RegisterWasteInput>({
    resolver: zodResolver(registerWasteSchema),
    defaultValues: { categoryCode: "", containerCount: "1", weightKg: "" },
  });

  const onSubmit = async (values: RegisterWasteInput) => {
    setServerError(null);
    const result = await registerWasteAction(values, idempotencyKey);
    if (result.ok) {
      setRegistered(result.waste);
      return;
    }
    setServerError(result.message);
    for (const [field, messages] of Object.entries(result.fields ?? {})) {
      if (messages?.[0] && field in values) {
        setError(field as keyof FormValues, { message: messages[0] });
      }
    }
  };

  if (registered) {
    return (
      <section
        role="status"
        className="bg-[#111116] border border-emerald-500/30 rounded-2xl p-5 space-y-4"
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-white">Waste registered</h2>
            <p className="text-sm text-zinc-400">
              Waste ID{" "}
              <span className="font-mono font-bold text-white">{registered.wasteCode}</span> ·{" "}
              {registered.containerCount} container(s), status Registered. Print one label per
              container and stick it on.
            </p>
          </div>
        </div>
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
          aria-label="Container codes"
        >
          {registered.containerCodes.map((code, i) => (
            <li
              key={code}
              className="font-mono text-sm text-zinc-200 bg-[#161622] border border-white/[0.06] rounded-lg px-3 py-2"
            >
              {code}{" "}
              <span className="text-zinc-500">
                ({i + 1} of {registered.containerCount})
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/waste/${registered.id}/labels`}
            target="_blank"
            rel="noopener"
            className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-black"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            Print labels (PDF)
          </a>
          <button
            type="button"
            onClick={() => {
              reset();
              setRegistered(null);
              setIdempotencyKey(newKey());
            }}
            className="min-h-[44px] px-4 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white"
          >
            Register more waste
          </button>
          <Link
            href="/hospital/waste"
            className="min-h-[44px] inline-flex items-center px-4 rounded-xl text-sm font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08]"
          >
            Back to waste records
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-5 max-w-xl"
    >
      <div className="flex items-center gap-3">
        <PackagePlus className="w-5 h-5 text-blue-400" aria-hidden="true" />
        <h2 className="text-base font-semibold text-white">Register waste</h2>
      </div>

      {serverError && (
        <p
          role="alert"
          className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3"
        >
          {serverError}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="categoryCode" className="block text-sm font-medium text-zinc-200">
          Waste category
        </label>
        <select
          id="categoryCode"
          aria-invalid={!!errors.categoryCode}
          aria-describedby={errors.categoryCode ? "categoryCode-error" : undefined}
          className={inputClass}
          {...register("categoryCode")}
        >
          <option value="">Choose a category…</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.colourCode.toLowerCase()} container)
            </option>
          ))}
        </select>
        {errors.categoryCode && (
          <p id="categoryCode-error" className="text-xs text-rose-400">
            {errors.categoryCode.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="containerCount" className="block text-sm font-medium text-zinc-200">
            Number of containers
          </label>
          <input
            id="containerCount"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_CONTAINERS_PER_REGISTRATION}
            step={1}
            aria-invalid={!!errors.containerCount}
            aria-describedby={errors.containerCount ? "containerCount-error" : undefined}
            className={inputClass}
            {...register("containerCount")}
          />
          {errors.containerCount && (
            <p id="containerCount-error" className="text-xs text-rose-400">
              {errors.containerCount.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="weightKg" className="block text-sm font-medium text-zinc-200">
            Total weight (kg)
          </label>
          <input
            id="weightKg"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            aria-invalid={!!errors.weightKg}
            aria-describedby={errors.weightKg ? "weightKg-error" : undefined}
            className={inputClass}
            {...register("weightKg")}
          />
          {errors.weightKg && (
            <p id="weightKg-error" className="text-xs text-rose-400">
              {errors.weightKg.message}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Each container gets its own code (Waste ID + container number). Weight is recorded as
        entered.
      </p>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full sm:w-auto min-h-[48px] px-6 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 disabled:opacity-60 text-white"
      >
        {isSubmitting ? "Registering…" : "Register waste"}
      </button>
    </form>
  );
}
