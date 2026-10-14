"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

export interface BottomNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional count shown next to the label. */
  count?: number;
}

const ACCENT = {
  amber: "text-amber-400",
  rose: "text-rose-400",
} as const;

/**
 * Fixed bottom navigation for the mobile-first areas. Each item is at least 56 px tall (touch target ≥ 48 px).
 * Pages in these areas must keep `pb-24` free at the bottom (the mobile layout does this).
 */
export function BottomNav({
  items,
  accent,
  label,
}: {
  items: BottomNavItem[];
  accent: keyof typeof ACCENT;
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className="fixed bottom-0 inset-x-0 z-30 border-t border-white/[0.08] bg-[#0a0a0d]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <ul
        className="max-w-3xl mx-auto grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ href, label: itemLabel, icon: Icon, count }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "min-h-[56px] flex flex-col items-center justify-center gap-1 px-2 text-xs font-medium transition-colors",
                  active ? ACCENT[accent] : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="truncate max-w-full">
                  {itemLabel}
                  {count !== undefined && <span className="font-mono"> ({count})</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
