import { Suspense } from "react";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { ContractsWidget } from "@/components/admin/widgets";

/** /admin/contracts — service contracts and renewals. */
export default function AdminContractsPage() {
  return (
    <Suspense fallback={<WidgetSkeleton height="h-96" label="contracts" />}>
      <ContractsWidget />
    </Suspense>
  );
}
