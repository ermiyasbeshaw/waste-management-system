"use client";

import { usePathname, useRouter } from "next/navigation";
import { Filter } from "lucide-react";
import type { CategoryRef, FacilityRef, RegulatorFilters } from "@/types/view-models";

/**
 * Scope filters for the regulator area. Only changes the URL (?facility=…&category=…); the server page reads
 * the URL and loads the matching KPIs (src/server/queries/regulator.ts). No data is fetched in the browser.
 */
export function RegulatorFilterBar({
  filters,
  facilities,
  categories,
}: {
  filters: RegulatorFilters;
  facilities: FacilityRef[];
  categories: CategoryRef[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  const setFilter = (key: "facility" | "category", value: string) => {
    const next = new URLSearchParams();
    const facility = key === "facility" ? value : filters.facilityCode;
    const category = key === "category" ? value : filters.categoryCode;
    if (facility !== "ALL") next.set("facility", facility);
    if (category !== "ALL") next.set("category", category);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="bg-[#111116] border border-white/[0.07] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
        <Filter className="w-4 h-4 text-indigo-400" aria-hidden="true" />
        <span>Regulatory Scope Filters:</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="regulator-facility">
          Facility
        </label>
        <select
          id="regulator-facility"
          value={filters.facilityCode}
          onChange={(e) => setFilter("facility", e.target.value)}
          className="bg-[#161622] text-xs text-zinc-200 border border-white/[0.08] rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/50"
        >
          <option value="ALL">All Healthcare Facilities ({facilities.length})</option>
          {facilities.map((f) => (
            <option key={f.id} value={f.code}>
              {f.name} ({f.code})
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="regulator-category">
          Waste category
        </label>
        <select
          id="regulator-category"
          value={filters.categoryCode}
          onChange={(e) => setFilter("category", e.target.value)}
          className="bg-[#161622] text-xs text-zinc-200 border border-white/[0.08] rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/50"
        >
          <option value="ALL">All Waste Categories</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
