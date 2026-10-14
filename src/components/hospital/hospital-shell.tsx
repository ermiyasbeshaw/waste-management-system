import React, { Suspense } from "react";
import { AlertCircle, Building2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { AreaTabs } from "@/components/shared/area-tabs";
import { KpiRowSkeleton } from "@/components/shared/skeleton";
import type { HospitalFacility } from "@/types/view-models";
import { HospitalKpisWidget } from "./widgets";

/**
 * Header, "not ready" warning, KPIs and tabs for every /hospital route (server component). The facility is the
 * signed-in user's own (src/server/queries/hospital.ts); KPIs load in their own <Suspense>.
 */
export function HospitalShell({
  facility,
  canSeeInvoices,
  children,
}: {
  facility: HospitalFacility | null;
  canSeeInvoices: boolean;
  children: React.ReactNode;
}) {
  if (!facility) {
    return (
      <ErrorState
        title="No facility for this account"
        description="Your account is not linked to a facility. Ask your hospital administrator."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${facility.name} Station`}
        subtitle={`Facility Code: ${facility.code} • ${facility.address}`}
        icon={Building2}
        badgeText={`FACILITY: ${facility.code}`}
        badgeColor="blue"
      />

      {/* Facility not ready: nobody receives pickup OTPs, so no pickup can be scheduled (CLAUDE.md §6). */}
      {facility.otpRecipientCount === 0 && (
        <div
          role="alert"
          className="bg-[#181611] border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 text-amber-300 text-xs"
        >
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold text-white">Not ready for pickup: </span>
            no user of this facility receives pickup codes. A hospital administrator must turn on
            &quot;receives pickup OTP&quot; for at least one user with a verified phone.
          </div>
        </div>
      )}

      <Suspense fallback={<KpiRowSkeleton />}>
        <HospitalKpisWidget />
      </Suspense>

      <AreaTabs
        accent="blue"
        tabs={[
          { href: "/hospital", label: "Facility Overview" },
          { href: "/hospital/waste", label: "Waste Records" },
          { href: "/hospital/certificates", label: "Destruction Certificates" },
          { href: "/hospital/stock", label: "Medicine Stock" },
          { href: "/hospital/stock/requests", label: "Disposal Requests" },
          ...(canSeeInvoices
            ? [
                { href: "/hospital/invoices", label: "Billing & Invoices" },
                { href: "/hospital/users", label: "Users & Pickup Codes" },
              ]
            : []),
        ]}
      />

      {children}
    </div>
  );
}
