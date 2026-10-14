import { clsx } from "clsx";

/** Placeholder shown while a dashboard widget loads (CLAUDE.md §8: each widget in its own Suspense). */
export function WidgetSkeleton({ height = "h-64", label }: { height?: string; label: string }) {
  return (
    <div
      role="status"
      aria-label={`Loading ${label}`}
      className={clsx(
        "bg-[#111116] border border-white/[0.07] rounded-2xl p-5 animate-pulse",
        height
      )}
    >
      <div className="h-3 w-40 rounded bg-white/[0.06]" />
      <div className="mt-4 h-full max-h-[80%] rounded-xl bg-white/[0.03]" />
      <span className="sr-only">Loading {label}…</span>
    </div>
  );
}

/** A row of KPI card placeholders. */
export function KpiRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      role="status"
      aria-label="Loading figures"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="h-28 bg-[#111116] border border-white/[0.07] rounded-2xl animate-pulse"
        />
      ))}
    </div>
  );
}
