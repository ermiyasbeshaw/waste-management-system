"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FACILITY_TYPES, facilitySchema, type FacilityInput } from "@/lib/validation/facility";
import type { FacilityDetail } from "@/types/view-models";
import {
  createFacilityAction,
  setFacilityStatusAction,
  updateFacilityAction,
} from "@/app/(desk)/admin/facilities/actions";
import {
  Field,
  FormError,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
} from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";

type Values = Record<keyof FacilityInput, string>;

const TYPE_LABEL: Record<(typeof FACILITY_TYPES)[number], string> = {
  REFERRAL_HOSPITAL: "Referral hospital",
  GENERAL_HOSPITAL: "General hospital",
  PRIMARY_HOSPITAL: "Primary hospital",
  CLINIC: "Clinic",
  PHARMACY: "Pharmacy",
  DISPOSAL_SITE: "Disposal site",
};

/** Create or edit a facility (super_admin). The code never changes after creation. */
export function FacilityForm({ facility }: { facility?: FacilityDetail }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, FacilityInput>({
    resolver: zodResolver(facilitySchema),
    defaultValues: {
      code: facility?.code ?? "",
      name: facility?.name ?? "",
      type: facility?.type ?? "",
      region: facility?.region ?? "Dire Dawa",
      city: facility?.city ?? "Dire Dawa",
      subCity: facility?.subCity ?? "",
      woreda: facility?.woreda ?? "",
      kebele: facility?.kebele ?? "",
      address: facility?.address ?? "",
      lat: facility ? String(facility.lat) : "",
      lng: facility ? String(facility.lng) : "",
    },
  });

  const onSubmit = async (values: FacilityInput) => {
    setServerError(null);
    setSaved(false);
    const result = facility
      ? await updateFacilityAction(facility.code, values)
      : await createFacilityAction(values);
    if (result.ok) {
      if (facility) {
        setSaved(true);
        router.refresh();
      } else {
        router.push(`/admin/facilities/${values.code}`);
      }
      return;
    }
    setServerError(result.message);
    for (const [field, messages] of Object.entries(result.fields ?? {})) {
      if (messages?.[0]) setError(field as keyof Values, { message: messages[0] });
    }
  };

  const text = (
    name: keyof Values,
    label: string,
    opts: { hint?: string; disabled?: boolean } = {}
  ) => (
    <Field id={name} label={label} error={errors[name]?.message} hint={opts.hint}>
      <input
        id={name}
        className={inputClass}
        disabled={opts.disabled}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `${name}-error` : opts.hint ? `${name}-hint` : undefined}
        {...register(name)}
      />
    </Field>
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-5 max-w-3xl"
    >
      <FormError message={serverError} />
      {saved && (
        <p role="status" className="text-sm text-emerald-300">
          Saved.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {text("code", "Facility code", {
          hint: facility ? "Codes never change" : "Format XX-XXX-000, never reused",
          disabled: !!facility,
        })}
        {text("name", "Name")}
        <Field id="type" label="Type" error={errors.type?.message}>
          <select
            id="type"
            className={inputClass}
            aria-invalid={!!errors.type}
            {...register("type")}
          >
            <option value="">Choose a type…</option>
            {FACILITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        {text("region", "Region")}
        {text("city", "City (optional)")}
        {text("subCity", "Sub-city (optional)")}
        {text("woreda", "Woreda (optional)")}
        {text("kebele", "Kebele (optional)")}
      </div>
      {text("address", "Address")}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {text("lat", "Latitude", { hint: "e.g. 9.5931 — used for the arrival geofence" })}
        {text("lng", "Longitude", { hint: "e.g. 41.8662" })}
      </div>
      <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
        {isSubmitting ? "Saving…" : facility ? "Save changes" : "Create facility"}
      </button>
    </form>
  );
}

/** Facility status (ACTIVE / INACTIVE / SUSPENDED) through the Workflow Engine. */
export function FacilityStatusControl({ facility }: { facility: FacilityDetail }) {
  const router = useRouter();
  const [status, setStatus] = useState(facility.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setBusy(true);
    setError(null);
    const result = await setFacilityStatusAction(facility.code, { status });
    setBusy(false);
    if (result.ok) router.refresh();
    else setError(result.message);
  };

  return (
    <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-3 max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Facility status</h3>
        <StatusBadge status={facility.status} size="sm" />
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <label htmlFor="facility-status" className="sr-only">
            New status
          </label>
          <select
            id="facility-status"
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={busy || status === facility.status}
          className={dangerButtonClass}
        >
          {busy ? "Changing…" : "Change status"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Only ACTIVE facilities can register waste and be scheduled for pickup.
      </p>
    </section>
  );
}
