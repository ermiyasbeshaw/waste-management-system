"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Field, FormError, inputClass, primaryButtonClass } from "@/components/shared/form-field";
import type { FacilityRef, FacilityRow, UserRow } from "@/types/view-models";
import { updateUserAccessAction } from "@/app/(desk)/admin/users/actions";
import { updateHospitalUserAction } from "@/app/(desk)/hospital/users/actions";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Administrator",
  hospital_admin: "Hospital Administrator",
  hospital_staff: "Hospital Staff / EHO",
  driver: "Fleet Driver",
  disposal_operator: "Disposal Operator",
  efda_officer: "EFDA Officer",
};
export const roleLabel = (role: string | null) =>
  role ? (ROLE_LABEL[role] ?? role) : "No role (pending)";

/** /admin/facilities — master data with readiness (CLAUDE.md §6). */
export function FacilitiesTable({ rows }: { rows: FacilityRow[] }) {
  const columns: Column<FacilityRow>[] = [
    {
      key: "code",
      header: "Code",
      render: (f) => (
        <Link
          href={`/admin/facilities/${f.code}`}
          className="font-mono font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
        >
          {f.code}
        </Link>
      ),
    },
    { key: "name", header: "Name", render: (f) => <span className="text-zinc-200">{f.name}</span> },
    {
      key: "type",
      header: "Type",
      render: (f) => (
        <span className="text-xs text-zinc-400">{f.type.replace(/_/g, " ").toLowerCase()}</span>
      ),
    },
    { key: "status", header: "Status", render: (f) => <StatusBadge status={f.status} size="sm" /> },
    {
      key: "otpRecipients",
      header: "Pickup readiness",
      render: (f) =>
        f.type === "DISPOSAL_SITE" ? (
          <span className="text-xs text-zinc-500">Disposal site</span>
        ) : f.ready ? (
          <span className="text-xs text-emerald-400">
            Ready · {f.otpRecipients} code recipient{f.otpRecipients === 1 ? "" : "s"}
          </span>
        ) : (
          <StatusBadge status="NOT_READY" size="sm" />
        ),
    },
    {
      key: "contractStatus",
      header: "Contract",
      render: (f) =>
        f.type === "DISPOSAL_SITE" ? (
          <span className="text-zinc-600 text-xs">—</span>
        ) : (
          <StatusBadge status={f.contractStatus ?? "NO_CONTRACT"} size="sm" />
        ),
    },
    {
      key: "usersCount",
      header: "Users",
      render: (f) => <span className="font-mono">{f.usersCount}</span>,
    },
  ];
  return (
    <DataTable
      title="Facilities"
      description="Health facilities and the disposal site. A facility is ready for pickup when it is active and has a hospital user with a verified phone who receives pickup codes."
      data={rows}
      columns={columns}
      getSearchText={(f) => `${f.code} ${f.name}`}
      searchPlaceholder="Search code or name…"
      pageSize={20}
    />
  );
}

/** /admin/users — every user; identity comes from Clerk. */
export function UsersTable({ rows }: { rows: UserRow[] }) {
  const columns: Column<UserRow>[] = [
    {
      key: "fullName",
      header: "Name",
      render: (u) => (
        <Link
          href={`/admin/users/${u.id}`}
          className="font-medium text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
        >
          {u.fullName}
        </Link>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u) => <span className="text-xs text-zinc-300">{roleLabel(u.role)}</span>,
    },
    {
      key: "facility",
      header: "Facility",
      render: (u) => (
        <span className="text-xs text-zinc-400">
          {u.facility ? `${u.facility.code} · ${u.facility.name}` : "—"}
        </span>
      ),
    },
    {
      key: "phoneMasked",
      header: "Phone",
      render: (u) => (
        <span className="font-mono text-xs text-zinc-400">
          {u.phoneMasked ?? "—"}{" "}
          {u.phoneMasked && (u.phoneVerified ? "✓ verified" : "· not verified")}
        </span>
      ),
    },
    {
      key: "receivesPickupOtp",
      header: "Pickup codes",
      render: (u) => <span className="text-xs">{u.receivesPickupOtp ? "Receives" : "—"}</span>,
    },
    {
      key: "active",
      header: "Access",
      render: (u) => <StatusBadge status={u.active ? "ACTIVE" : "INACTIVE"} size="sm" />,
    },
  ];
  return (
    <DataTable
      title="Users"
      description="Roles, facility and access. Names, emails and phones come from Clerk (phone verification happens in Clerk only)."
      data={rows}
      columns={columns}
      getSearchText={(u) => `${u.fullName} ${u.email} ${u.facility?.code ?? ""}`}
      searchPlaceholder="Search name, email or facility…"
      pageSize={20}
    />
  );
}

const FACILITY_ROLES = ["hospital_admin", "hospital_staff", "disposal_operator"];

/** Super admin: role, facility, access and pickup-code flag of one user. */
export function UserAccessForm({
  user,
  facilities,
  isSelf,
}: {
  user: UserRow;
  facilities: FacilityRef[];
  isSelf: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState(user.role ?? "");
  const [facilityCode, setFacilityCode] = useState(user.facility?.code ?? "");
  const [active, setActive] = useState(user.active);
  const [otp, setOtp] = useState(user.receivesPickupOtp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const needsFacility = FACILITY_ROLES.includes(role);
  const canReceiveOtp =
    (role === "hospital_admin" || role === "hospital_staff") && user.phoneVerified;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await updateUserAccessAction(user.id, {
      role: role || null,
      facilityCode: needsFacility ? facilityCode || null : null,
      active,
      receivesPickupOtp: canReceiveOtp ? otp : false,
    });
    setBusy(false);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    } else setError(result.message);
  };

  return (
    <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-white">{user.fullName}</h2>
        <p className="text-sm text-zinc-400">
          {user.email} · {user.phoneMasked ?? "no phone"}{" "}
          {user.phoneMasked && (user.phoneVerified ? "(verified)" : "(not verified)")}
        </p>
      </div>
      <FormError message={error} />
      {saved && (
        <p role="status" className="text-sm text-emerald-300">
          Saved.
        </p>
      )}
      <Field id="role" label="Role">
        <select
          id="role"
          className={inputClass}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={isSelf}
        >
          <option value="">No role (pending)</option>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {needsFacility && (
        <Field
          id="facilityCode"
          label="Facility"
          hint="Disposal operators belong to the disposal site"
        >
          <select
            id="facilityCode"
            className={inputClass}
            value={facilityCode}
            onChange={(e) => setFacilityCode(e.target.value)}
          >
            <option value="">Choose a facility…</option>
            {facilities.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code} · {f.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <label className="flex items-center gap-3 text-sm text-zinc-200 min-h-[44px]">
        <input
          type="checkbox"
          className="w-5 h-5"
          checked={active}
          disabled={isSelf}
          onChange={(e) => setActive(e.target.checked)}
        />
        Active (can sign in to their area)
      </label>
      <label className="flex items-center gap-3 text-sm text-zinc-200 min-h-[44px]">
        <input
          type="checkbox"
          className="w-5 h-5"
          checked={canReceiveOtp && otp}
          disabled={!canReceiveOtp}
          onChange={(e) => setOtp(e.target.checked)}
        />
        Receives pickup codes (SMS)
      </label>
      {!canReceiveOtp && (
        <p className="text-xs text-zinc-500">
          Only hospital users with a phone verified in Clerk can receive pickup codes.
        </p>
      )}
      {isSelf && (
        <p className="text-xs text-amber-400">You cannot change your own role or access.</p>
      )}
      <button type="button" onClick={save} disabled={busy} className={primaryButtonClass}>
        {busy ? "Saving…" : "Save access"}
      </button>
    </section>
  );
}

/** hospital_admin: own facility's users — who is active and who receives pickup codes. */
export function HospitalUsersList({ rows, selfId }: { rows: UserRow[]; selfId: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = async (
    u: UserRow,
    change: Partial<Pick<UserRow, "active" | "receivesPickupOtp">>
  ) => {
    setBusyId(u.id);
    setError(null);
    const result = await updateHospitalUserAction(u.id, {
      active: change.active ?? u.active,
      receivesPickupOtp: change.receivesPickupOtp ?? u.receivesPickupOtp,
    });
    setBusyId(null);
    if (result.ok) router.refresh();
    else setError(result.message);
  };

  const recipients = rows.filter((u) => u.active && u.receivesPickupOtp).length;

  return (
    <section className="space-y-3">
      <div className="bg-[#111116] border border-white/[0.07] rounded-2xl p-4 text-sm text-zinc-300">
        <strong className="text-white">{recipients}</strong> user{recipients === 1 ? "" : "s"}{" "}
        receive pickup codes.
        {recipients === 0 && (
          <span className="text-amber-400">
            {" "}
            No pickup can be scheduled until at least one does.
          </span>
        )}
      </div>
      <FormError message={error} />
      <ul className="space-y-2">
        {rows.map((u) => {
          const canOtp =
            u.phoneVerified && (u.role === "hospital_admin" || u.role === "hospital_staff");
          return (
            <li
              key={u.id}
              className="bg-[#111116] border border-white/[0.07] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-white">
                  {u.fullName}{" "}
                  {u.id === selfId && <span className="text-xs text-zinc-500">(you)</span>}
                </p>
                <p className="text-xs text-zinc-400">
                  {roleLabel(u.role)} · {u.phoneMasked ?? "no phone"}{" "}
                  {u.phoneMasked && (u.phoneVerified ? "✓ verified" : "· not verified")}
                </p>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-200 min-h-[44px]">
                  <input
                    type="checkbox"
                    className="w-5 h-5"
                    checked={u.receivesPickupOtp}
                    disabled={!canOtp || busyId === u.id}
                    onChange={(e) => update(u, { receivesPickupOtp: e.target.checked })}
                  />
                  Pickup codes
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-200 min-h-[44px]">
                  <input
                    type="checkbox"
                    className="w-5 h-5"
                    checked={u.active}
                    disabled={u.id === selfId || busyId === u.id}
                    onChange={(e) => update(u, { active: e.target.checked })}
                  />
                  Active
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-zinc-500">
        Pickup codes go only to users whose phone is verified in Clerk. New users are invited by the
        platform administrator.
      </p>
    </section>
  );
}
