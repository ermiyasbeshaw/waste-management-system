import Link from "next/link";
import type { FacilityRef } from "@/types/view-models";

/** Filter links (all / expiring / expired) and, for super_admin and EFDA, a facility choice (GET form). */
export function StockFilters({
  basePath,
  filter,
  facilityCode,
  facilities,
}: {
  basePath: string;
  filter: "all" | "expiring" | "expired";
  facilityCode: string | null;
  facilities?: FacilityRef[];
}) {
  const link = (f: string) => {
    const p = new URLSearchParams();
    if (f !== "all") p.set("filter", f);
    if (facilityCode) p.set("facility", facilityCode);
    const q = p.toString();
    return q ? `${basePath}?${q}` : basePath;
  };
  const tab = (f: "all" | "expiring" | "expired", label: string) => (
    <Link
      key={f}
      href={link(f)}
      aria-current={filter === f ? "page" : undefined}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
        filter === f
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
          : "border-white/[0.08] text-zinc-300 hover:bg-white/[0.05]"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Stock filter" className="flex gap-2">
        {tab("all", "All stock")}
        {tab("expiring", "Expiring")}
        {tab("expired", "Expired")}
      </nav>
      {facilities && (
        <form method="get" action={basePath} className="flex items-center gap-2">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <label htmlFor="stock-facility" className="text-xs text-zinc-400">
            Facility
          </label>
          <select
            id="stock-facility"
            name="facility"
            defaultValue={facilityCode ?? ""}
            className="min-h-[36px] bg-[#161622] border border-white/[0.1] rounded-lg px-2 text-xs text-zinc-100"
          >
            <option value="">All facilities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.code}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-[36px] px-3 rounded-lg text-xs font-semibold bg-white/[0.06] text-zinc-200"
          >
            Show
          </button>
        </form>
      )}
    </div>
  );
}
