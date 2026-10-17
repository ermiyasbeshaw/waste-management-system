import { Suspense } from "react";
import { requireAreaAccess } from "@/server/auth/area-guard";
import { AdminPageHeader } from "@/components/admin/admin-header";
import { AdminKpisWidget } from "@/components/admin/widgets";
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
      {children}
    </div>
  );
}
