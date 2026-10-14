import { Suspense } from "react";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { CategoryCardsWidget } from "@/components/admin/widgets";

/** /admin/categories — 30-day volume per waste category. */
export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<WidgetSkeleton height="h-64" label="categories" />}>
      <CategoryCardsWidget />
    </Suspense>
  );
}
