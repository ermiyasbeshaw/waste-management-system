import { Suspense } from "react";
import { requireAreaAccess } from "@/server/auth/area-guard";
import { AdminPageHeader } from "@/components/admin/admin-header";
import { AdminKpisWidget } from "@/components/admin/widgets";
import { AreaTabs } from "@/components/shared/area-tabs";
import { KpiRowSkeleton } from "@/components/shared/skeleton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Area guard (CLAUDE.md §3): no access → /pending; another role → its own area.
  await requireAreaAccess("admin");

  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <Suspense fallback={<KpiRowSkeleton count={6} />}>
        <AdminKpisWidget />
      </Suspense>
      <AreaTabs
        accent="emerald"
        tabs={[
          { href: "/admin", label: "Overview" },
          { href: "/admin/trips", label: "Trips" },
          { href: "/admin/certificates", label: "Certificates" },
          { href: "/admin/fleet", label: "Live Fleet Radar" },
          { href: "/admin/fleet/manage", label: "Fleet & Licences" },
          { href: "/admin/facilities", label: "Facilities" },
          { href: "/admin/users", label: "Users" },
          { href: "/admin/finance", label: "Invoices & Billing" },
          { href: "/admin/contracts", label: "Contracts & Renewals" },
          { href: "/admin/categories", label: "Waste Categories" },
          { href: "/admin/alerts", label: "Alerts" },
          { href: "/admin/stock", label: "Medicine Stock" },
          { href: "/admin/settings", label: "Settings" },
        ]}
      />
      {children}
    </div>
  );
}
