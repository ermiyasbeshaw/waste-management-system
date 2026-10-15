"use client";

import { useState, useTransition } from "react";
import { Check, X, UserPlus, Clock, Building, ShieldCheck, AlertCircle } from "lucide-react";
import type { OnboardingRequestRow } from "@/server/queries/onboarding";
import {
  approveOnboardingRequestAction,
  provisionUserAction,
  rejectOnboardingRequestAction,
} from "@/app/(desk)/admin/users/actions";
import {
  approveHospitalStaffRequestAction,
  rejectHospitalStaffRequestAction,
} from "@/app/(desk)/hospital/users/actions";

interface FacilityRef {
  id: string;
  code: string;
  name: string;
}

// ---------------------------------------------------------------- Admin Onboarding Table
export function AdminOnboardingTable({
  requests,
  facilities,
}: {
  requests: OnboardingRequestRow[];
  facilities: FacilityRef[];
}) {
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleApprove = (id: string) => {
    setMessage(null);
    startTransition(async () => {
      const res = await approveOnboardingRequestAction(id);
      if (res.ok) {
        setMessage({ type: "success", text: "Onboarding request approved and user provisioned." });
      } else {
        setMessage({ type: "error", text: res.message });
      }
    });
  };

  const handleReject = (id: string) => {
    if (!rejectionReason.trim()) {
      setMessage({ type: "error", text: "A rejection reason is required." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await rejectOnboardingRequestAction(id, rejectionReason.trim());
      if (res.ok) {
        setRejectingId(null);
        setRejectionReason("");
        setMessage({ type: "success", text: "Onboarding request rejected." });
      } else {
        setMessage({ type: "error", text: res.message });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#111116] border border-white/[0.08] p-4 rounded-xl">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">Pending Onboarding Requests</h2>
            <span className="bg-amber-500/10 text-amber-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-500/20">
              {requests.length}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Path A self-registration requests awaiting administrator approval hierarchy review.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowProvisionModal(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs transition-all shadow-md shadow-emerald-500/20 cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Provision User (Path B)</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="bg-[#111116]/50 border border-white/[0.06] rounded-xl p-8 text-center text-xs text-zinc-500">
          No pending onboarding requests at this time. All self-registrations have been reviewed.
        </div>
      ) : (
        <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-[#111116]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#18181f] text-zinc-400 uppercase tracking-wider text-[10px] border-b border-white/[0.06]">
                <tr>
                  <th className="py-3 px-4">Applicant</th>
                  <th className="py-3 px-4">Requested Role</th>
                  <th className="py-3 px-4">Facility Target</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-zinc-200">{r.fullName}</div>
                      <div className="text-[11px] text-zinc-400 font-mono">{r.email}</div>
                      {r.phoneE164 && (
                        <div className="text-[10px] text-zinc-500 font-mono">{r.phoneE164}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {r.requestedRole.replace(/_/g, " ")}
                      </span>
                      {r.notes && (
                        <div className="text-[11px] text-zinc-400 mt-1 max-w-xs truncate">
                          &quot;{r.notes}&quot;
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {r.facility ? (
                        <div>
                          <div className="text-zinc-200">{r.facility.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{r.facility.code}</div>
                        </div>
                      ) : r.newFacility ? (
                        <div>
                          <div className="text-amber-300 font-medium flex items-center gap-1">
                            <Building className="w-3 h-3" />
                            <span>New Hospital: {r.newFacility.name}</span>
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {r.newFacility.type} · {r.newFacility.address}
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-500">Global Role (No Facility)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-[11px]">
                      {new Date(r.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {rejectingId === r.id ? (
                        <div className="flex flex-col items-end gap-1.5">
                          <input
                            type="text"
                            placeholder="Rejection reason..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            className="bg-[#18181f] border border-rose-500/40 rounded px-2 py-1 text-xs text-zinc-200 w-44"
                          />
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleReject(r.id)}
                              className="px-2 py-1 rounded bg-rose-500 text-white font-semibold text-[10px] hover:bg-rose-600"
                            >
                              Confirm Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectionReason("");
                              }}
                              className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-[10px] hover:bg-zinc-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleApprove(r.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-semibold text-xs transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              setRejectingId(r.id);
                              setRejectionReason("");
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-semibold text-xs transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showProvisionModal && (
        <ProvisionUserModal
          facilities={facilities}
          onClose={() => setShowProvisionModal(false)}
          onSuccess={(text) => {
            setShowProvisionModal(false);
            setMessage({ type: "success", text });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Hospital Staff Requests Table
export function HospitalStaffRequestsTable({ requests }: { requests: OnboardingRequestRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleApprove = (id: string) => {
    setMessage(null);
    startTransition(async () => {
      const res = await approveHospitalStaffRequestAction(id);
      if (res.ok) {
        setMessage({ type: "success", text: "Staff request approved. User activated." });
      } else {
        setMessage({ type: "error", text: res.message });
      }
    });
  };

  const handleReject = (id: string) => {
    if (!rejectionReason.trim()) {
      setMessage({ type: "error", text: "A rejection reason is required." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await rejectHospitalStaffRequestAction(id, rejectionReason.trim());
      if (res.ok) {
        setRejectingId(null);
        setRejectionReason("");
        setMessage({ type: "success", text: "Staff request rejected." });
      } else {
        setMessage({ type: "error", text: res.message });
      }
    });
  };

  if (requests.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      <div className="bg-[#111116] border border-amber-500/20 p-4 rounded-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Pending Staff Requests for Your Facility</h3>
            <span className="bg-amber-500/10 text-amber-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-500/20">
              {requests.length}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            As Hospital Administrator, you approve staff requests strictly for your own facility.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-[#111116]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#18181f] text-zinc-400 uppercase tracking-wider text-[10px] border-b border-white/[0.06]">
            <tr>
              <th className="py-3 px-4">Applicant</th>
              <th className="py-3 px-4">Requested Role</th>
              <th className="py-3 px-4">Submitted</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                <td className="py-3 px-4">
                  <div className="font-medium text-zinc-200">{r.fullName}</div>
                  <div className="text-[11px] text-zinc-400 font-mono">{r.email}</div>
                  {r.phoneE164 && (
                    <div className="text-[10px] text-zinc-500 font-mono">{r.phoneE164}</div>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Hospital Staff / EHO
                  </span>
                  {r.notes && (
                    <div className="text-[11px] text-zinc-400 mt-1">&quot;{r.notes}&quot;</div>
                  )}
                </td>
                <td className="py-3 px-4 text-zinc-400 text-[11px]">
                  {new Date(r.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 text-right">
                  {rejectingId === r.id ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <input
                        type="text"
                        placeholder="Rejection reason..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="bg-[#18181f] border border-rose-500/40 rounded px-2 py-1 text-xs text-zinc-200 w-44"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleReject(r.id)}
                          className="px-2 py-1 rounded bg-rose-500 text-white font-semibold text-[10px]"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectingId(null)}
                          className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-[10px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleApprove(r.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-semibold text-xs cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve Staff</span>
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setRejectingId(r.id);
                          setRejectionReason("");
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-semibold text-xs cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Provision User Modal (Path B)
function ProvisionUserModal({
  facilities,
  onClose,
  onSuccess,
}: {
  facilities: FacilityRef[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clerkUserId, setClerkUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [role, setRole] = useState<
    | "super_admin"
    | "hospital_admin"
    | "hospital_staff"
    | "driver"
    | "disposal_operator"
    | "efda_officer"
  >("hospital_staff");
  const [facilityCode, setFacilityCode] = useState(facilities[0]?.code ?? "");
  const [active, setActive] = useState(true);
  const [receivesPickupOtp, setReceivesPickupOtp] = useState(false);

  const isHospital = role === "hospital_admin" || role === "hospital_staff";
  const isDisposal = role === "disposal_operator";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const payload = {
        clerkUserId: clerkUserId.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        phoneE164: phoneE164.trim() ? phoneE164.trim() : undefined,
        role,
        facilityCode: isHospital || isDisposal ? facilityCode : undefined,
        active,
        receivesPickupOtp: isHospital ? receivesPickupOtp : false,
      };

      const res = await provisionUserAction(payload);
      if (!res.ok) {
        setError(res.message);
      } else {
        onSuccess(`User ${fullName} provisioned directly as ${role}.`);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111116] border border-white/[0.1] rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Direct Account Provisioning (Path B)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-zinc-400 mb-1">Clerk User ID *</label>
            <input
              type="text"
              required
              placeholder="e.g. user_2abc... or identity token"
              value={clerkUserId}
              onChange={(e) => setClerkUserId(e.target.value)}
              className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-400 mb-1">Full Name *</label>
              <input
                type="text"
                required
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Email *</label>
              <input
                type="email"
                required
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-400 mb-1">Phone Number (E.164)</label>
              <input
                type="tel"
                placeholder="+251911..."
                value={phoneE164}
                onChange={(e) => setPhoneE164(e.target.value)}
                className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Role *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
              >
                <option value="super_admin">Super Administrator</option>
                <option value="hospital_admin">Hospital Administrator</option>
                <option value="hospital_staff">Hospital Staff / EHO</option>
                <option value="driver">Fleet Driver</option>
                <option value="disposal_operator">Disposal Operator</option>
                <option value="efda_officer">EFDA Officer</option>
              </select>
            </div>
          </div>

          {(isHospital || isDisposal) && (
            <div>
              <label className="block text-zinc-400 mb-1">Facility *</label>
              <select
                value={facilityCode}
                onChange={(e) => setFacilityCode(e.target.value)}
                className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
              >
                {facilities.map((f) => (
                  <option key={f.id} value={f.code}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500"
              />
              <span>Active Access</span>
            </label>

            {isHospital && (
              <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={receivesPickupOtp}
                  onChange={(e) => setReceivesPickupOtp(e.target.checked)}
                  className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500"
                />
                <span>Receives Pickup OTPs</span>
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 hover:bg-emerald-600 font-bold"
            >
              {isPending ? "Provisioning..." : "Provision User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
