"use client";

import { useState, useTransition } from "react";
import {
  Clock,
  Building2,
  UserCheck,
  ShieldAlert,
  Send,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { submitOnboardingRequestAction } from "@/app/pending/actions";
import type { OnboardingRequestRow } from "@/server/queries/onboarding";

interface FacilityOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface OnboardingViewProps {
  request: OnboardingRequestRow | null;
  facilities: FacilityOption[];
  userEmail?: string;
  userName?: string;
}

export function OnboardingView({
  request,
  facilities,
  userEmail = "",
  userName = "",
}: OnboardingViewProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [fullName, setFullName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [phoneE164, setPhoneE164] = useState("");
  const [requestedRole, setRequestedRole] = useState<
    "hospital_admin" | "hospital_staff" | "driver" | "disposal_operator" | "efda_officer"
  >("hospital_staff");
  const [facilityMode, setFacilityMode] = useState<"existing" | "new">("existing");
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? "");
  const [notes, setNotes] = useState("");

  // New facility fields
  const [facilityName, setFacilityName] = useState("");
  const [facilityType, setFacilityType] = useState<
    "REFERRAL_HOSPITAL" | "GENERAL_HOSPITAL" | "PRIMARY_HOSPITAL" | "CLINIC" | "PHARMACY"
  >("GENERAL_HOSPITAL");
  const [facilityRegion, setFacilityRegion] = useState("Dire Dawa");
  const [facilityCity, setFacilityCity] = useState("Dire Dawa");
  const [facilityAddress, setFacilityAddress] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const payload = {
        fullName,
        email,
        phoneE164: phoneE164.trim() ? phoneE164.trim() : undefined,
        requestedRole,
        facilityId:
          requestedRole === "hospital_staff" ||
          (requestedRole === "hospital_admin" && facilityMode === "existing")
            ? facilityId
            : undefined,
        facilityName:
          requestedRole === "hospital_admin" && facilityMode === "new" ? facilityName : undefined,
        facilityType:
          requestedRole === "hospital_admin" && facilityMode === "new" ? facilityType : undefined,
        facilityRegion:
          requestedRole === "hospital_admin" && facilityMode === "new" ? facilityRegion : undefined,
        facilityCity:
          requestedRole === "hospital_admin" && facilityMode === "new" ? facilityCity : undefined,
        facilityAddress:
          requestedRole === "hospital_admin" && facilityMode === "new" ? facilityAddress : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      };

      const res = await submitOnboardingRequestAction(payload);
      if (!res.ok) {
        setError(res.message);
      } else {
        setSuccess(
          "Your onboarding request has been submitted and is currently PENDING_REVIEW. An administrator will review your application."
        );
      }
    });
  };

  // If request is in PENDING_REVIEW, show status card
  if (request && request.status === "PENDING_REVIEW") {
    return (
      <div className="bg-[#111116] border border-amber-500/20 rounded-2xl p-8 max-w-lg w-full text-center space-y-6 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
          <Clock className="w-7 h-7" aria-hidden="true" />
        </div>
        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2">
            PENDING_REVIEW
          </span>
          <h1 className="text-xl font-bold text-white">Onboarding Request Under Review</h1>
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
            Your self-registration request has been received. In accordance with platform security
            policy, your profile has{" "}
            <span className="text-amber-300 font-semibold">zero operational access</span> until an
            administrator reviews and approves your account.
          </p>
        </div>

        <div className="bg-[#18181f] border border-white/[0.06] rounded-xl p-4 text-left space-y-2.5 text-xs">
          <div className="flex justify-between items-center text-zinc-400">
            <span>Applicant:</span>
            <span className="text-zinc-200 font-medium">{request.fullName}</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Email:</span>
            <span className="text-zinc-200 font-medium">{request.email}</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Requested Role:</span>
            <span className="text-emerald-400 font-semibold uppercase tracking-wider">
              {request.requestedRole.replace(/_/g, " ")}
            </span>
          </div>
          {request.facility && (
            <div className="flex justify-between items-center text-zinc-400">
              <span>Target Facility:</span>
              <span className="text-zinc-200 font-medium">
                {request.facility.name} ({request.facility.code})
              </span>
            </div>
          )}
          {request.newFacility && (
            <div className="flex justify-between items-center text-zinc-400">
              <span>New Facility Request:</span>
              <span className="text-zinc-200 font-medium">{request.newFacility.name}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-zinc-400">
            <span>Submitted On:</span>
            <span className="text-zinc-300">
              {new Date(request.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3 text-xs text-zinc-400 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            {request.requestedRole === "hospital_staff"
              ? "Staff requests are approved by your Hospital Administrator."
              : "Administrative, driver, and officer requests are approved by the Super Administrator."}
          </span>
        </div>
      </div>
    );
  }

  // If rejected, show rejection message and option to re-apply
  const isRejected = request && request.status === "REJECTED";

  return (
    <div className="bg-[#111116] border border-white/[0.08] rounded-2xl p-6 sm:p-8 max-w-xl w-full shadow-2xl space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
          <UserCheck className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-white">SafeWaste Onboarding Request</h1>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          Submit your profile details and requested role. Once reviewed by the appropriate
          administrator, your account will be activated with appropriate operational access.
        </p>
      </div>

      {isRejected && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-xs space-y-1 text-rose-300">
          <div className="flex items-center gap-1.5 font-semibold text-rose-400">
            <XCircle className="w-4 h-4" />
            <span>Previous Request Not Approved</span>
          </div>
          {request.rejectionReason && <p>Reason: {request.rejectionReason}</p>}
          <p className="text-zinc-400 mt-1">You may submit an updated request below.</p>
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-zinc-400 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Dr. Aster Tadesse"
            />
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
              placeholder="user@example.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-zinc-400 mb-1">Phone Number (E.164)</label>
            <input
              type="tel"
              value={phoneE164}
              onChange={(e) => setPhoneE164(e.target.value)}
              className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
              placeholder="+251911223344"
            />
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">Requested Role *</label>
            <select
              value={requestedRole}
              onChange={(e) =>
                setRequestedRole(
                  e.target.value as
                    | "hospital_admin"
                    | "hospital_staff"
                    | "driver"
                    | "disposal_operator"
                    | "efda_officer"
                )
              }
              className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="hospital_staff">Hospital Staff / Environmental Health Officer</option>
              <option value="hospital_admin">Hospital Administrator</option>
              <option value="driver">Fleet Driver</option>
              <option value="disposal_operator">Disposal Site Operator</option>
              <option value="efda_officer">EFDA Regulatory & Audit Officer</option>
            </select>
          </div>
        </div>

        {/* Facility Selection for Hospital Roles */}
        {requestedRole === "hospital_staff" && (
          <div>
            <label className="block text-zinc-400 mb-1">Select Your Hospital / Facility *</label>
            <select
              required
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
              className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.code} - {f.type})
                </option>
              ))}
            </select>
          </div>
        )}

        {requestedRole === "hospital_admin" && (
          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                <input
                  type="radio"
                  name="facMode"
                  checked={facilityMode === "existing"}
                  onChange={() => setFacilityMode("existing")}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span>Join Existing Hospital</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                <input
                  type="radio"
                  name="facMode"
                  checked={facilityMode === "new"}
                  onChange={() => setFacilityMode("new")}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span>Register New Facility</span>
              </label>
            </div>

            {facilityMode === "existing" ? (
              <div>
                <label className="block text-zinc-400 mb-1">Select Facility *</label>
                <select
                  value={facilityId}
                  onChange={(e) => setFacilityId(e.target.value)}
                  className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3 bg-[#14141a] p-3 rounded-xl border border-white/[0.06]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 mb-1">Facility Name *</label>
                    <input
                      type="text"
                      required
                      value={facilityName}
                      onChange={(e) => setFacilityName(e.target.value)}
                      className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                      placeholder="e.g. Dire Dawa Specialized Clinic"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Facility Type *</label>
                    <select
                      value={facilityType}
                      onChange={(e) => setFacilityType(e.target.value as typeof facilityType)}
                      className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                    >
                      <option value="GENERAL_HOSPITAL">General Hospital</option>
                      <option value="REFERRAL_HOSPITAL">Referral Hospital</option>
                      <option value="PRIMARY_HOSPITAL">Primary Hospital</option>
                      <option value="CLINIC">Clinic</option>
                      <option value="PHARMACY">Pharmacy / Wholesaler</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Address *</label>
                  <input
                    type="text"
                    required
                    value={facilityAddress}
                    onChange={(e) => setFacilityAddress(e.target.value)}
                    className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
                    placeholder="e.g. Kebele 04, Genda Kore Street"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {requestedRole === "disposal_operator" && (
          <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 text-zinc-400 text-xs flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Disposal Operators are automatically bound to the Central Disposal Site.</span>
          </div>
        )}

        <div>
          <label className="block text-zinc-400 mb-1">Application Notes / Organization Details</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-[#18181f] border border-white/[0.08] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none"
            placeholder="Add any additional context or affiliation information..."
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>{isPending ? "Submitting Request..." : "Submit Onboarding Request"}</span>
        </button>
      </form>
    </div>
  );
}
