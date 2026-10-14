"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { clsx } from "clsx";

export type TabAccent = "emerald" | "blue" | "indigo" | "amber" | "rose";

export interface AreaTab {
  href: string;
  label: string;
}

const ACTIVE: Record<TabAccent, string> = {
  emerald: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm",
  blue: "bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-sm",
  indigo: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm",
  amber: "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm",
  rose: "bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm",
};

/**
 * Link-based pill tabs (replaces the per-page `useState` tab bars). Each tab is its own route.
 * `keepSearch` carries the current query string (e.g. regulator filters) to the other tabs.
 */
export function AreaTabs({
  tabs,
  accent,
  keepSearch = false,
}: {
  tabs: AreaTab[];
  accent: TabAccent;
  keepSearch?: boolean;
}) {
  if (!keepSearch) return <TabList tabs={tabs} accent={accent} query="" />;
  // useSearchParams needs a Suspense boundary for prerendered pages (Next 14).
  return (
    <Suspense fallback={<TabList tabs={tabs} accent={accent} query="" />}>
      <TabListWithSearch tabs={tabs} accent={accent} />
    </Suspense>
  );
}

function TabListWithSearch({ tabs, accent }: { tabs: AreaTab[]; accent: TabAccent }) {
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  return <TabList tabs={tabs} accent={accent} query={qs ? `?${qs}` : ""} />;
}

function TabList({ tabs, accent, query }: { tabs: AreaTab[]; accent: TabAccent; query: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2 border-b border-white/[0.06] pb-3 overflow-x-auto">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${query}`}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap",
              active ? ACTIVE[accent] : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
