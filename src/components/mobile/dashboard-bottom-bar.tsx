"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  CreditCard,
  Building2,
  Activity,
  FileCheck2,
  History,
  ClipboardCheck,
  AlertTriangle,
  Pill,
  MapPin,
  Flame,
  PlusCircle,
  LucideIcon,
} from "lucide-react";
import { clsx } from "clsx";
import { useDevSession } from "@/components/dev/dev-role-provider";
import type { UserRole } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export function DashboardBottomBar() {
  const pathname = usePathname();
  const { activeRole, user } = useDevSession();

  if (!user || !activeRole) return null;

  const getNavItems = (role: UserRole): NavItem[] => {
    switch (role) {
      case "super_admin":
        return [
          { href: "/admin", label: "Overview", icon: LayoutDashboard },
          { href: "/admin/fleet", label: "Radar", icon: Truck },
          { href: "/admin/finance", label: "Finance", icon: CreditCard },
          { href: "/admin/trips", label: "Trips", icon: MapPin },
          { href: "/admin/alerts", label: "Alerts", icon: AlertTriangle },
        ];
      case "hospital_admin":
        return [
          { href: "/hospital", label: "Station", icon: Building2 },
          { href: "/hospital/waste", label: "Waste", icon: Activity },
          { href: "/hospital/waste/new", label: "Register", icon: PlusCircle },
          { href: "/hospital/stock", label: "Stock", icon: Pill },
          { href: "/hospital/invoices", label: "Invoices", icon: CreditCard },
        ];
      case "hospital_staff":
        return [
          { href: "/hospital", label: "Station", icon: Building2 },
          { href: "/hospital/waste", label: "Waste", icon: Activity },
          { href: "/hospital/waste/new", label: "Register", icon: PlusCircle },
          { href: "/hospital/stock", label: "Stock", icon: Pill },
          { href: "/hospital/certificates", label: "Certs", icon: FileCheck2 },
        ];
      case "efda_officer":
        return [
          { href: "/regulator", label: "Analytics", icon: Activity },
          { href: "/regulator/audit", label: "Audit", icon: History },
          { href: "/regulator/certificates", label: "Registry", icon: FileCheck2 },
          { href: "/regulator/map", label: "Route Map", icon: MapPin },
          { href: "/regulator/approvals", label: "Approvals", icon: ClipboardCheck },
        ];
      case "driver":
        return [
          { href: "/driver", label: "Today's Trip", icon: Truck },
          { href: "/driver/upcoming", label: "Upcoming", icon: History },
        ];
      case "disposal_operator":
        return [
          { href: "/disposal", label: "Queue", icon: Flame },
          { href: "/disposal/inbound", label: "Inbound", icon: Truck },
          { href: "/disposal/exceptions", label: "Exceptions", icon: AlertTriangle },
        ];
      default:
        return [];
    }
  };

  const items = getNavItems(activeRole);
  if (items.length === 0) return null;

  const accentColors: Record<UserRole, { active: string; icon: string; dot: string }> = {
    super_admin: {
      active: "text-emerald-400 font-bold",
      icon: "text-emerald-400",
      dot: "bg-emerald-400",
    },
    hospital_admin: {
      active: "text-blue-400 font-bold",
      icon: "text-blue-400",
      dot: "bg-blue-400",
    },
    hospital_staff: {
      active: "text-cyan-400 font-bold",
      icon: "text-cyan-400",
      dot: "bg-cyan-400",
    },
    efda_officer: {
      active: "text-indigo-400 font-bold",
      icon: "text-indigo-400",
      dot: "bg-indigo-400",
    },
    driver: {
      active: "text-amber-400 font-bold",
      icon: "text-amber-400",
      dot: "bg-amber-400",
    },
    disposal_operator: {
      active: "text-rose-400 font-bold",
      icon: "text-rose-400",
      dot: "bg-rose-400",
    },
  };

  const theme = accentColors[activeRole] ?? {
    active: "text-emerald-400 font-bold",
    icon: "text-emerald-400",
    dot: "bg-emerald-400",
  };

  return (
    <nav
      aria-label="Mobile Dashboard Navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#09090d]/95 backdrop-blur-xl border-t border-white/[0.1] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.6)]"
    >
      <ul
        className="grid items-center h-16 px-1"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" &&
              item.href !== "/hospital" &&
              item.href !== "/regulator" &&
              pathname.startsWith(item.href));

          const Icon = item.icon;

          return (
            <li key={item.href} className="h-full">
              <Link
                href={item.href}
                className={clsx(
                  "h-full flex flex-col items-center justify-center gap-1 text-[10px] tracking-tight transition-all relative select-none",
                  isActive
                    ? theme.active
                    : "text-zinc-400 hover:text-zinc-200 active:scale-95"
                )}
              >
                {/* Active Indicator Pip */}
                {isActive && (
                  <span
                    className={clsx(
                      "absolute top-1.5 w-1 h-1 rounded-full",
                      theme.dot
                    )}
                  />
                )}
                <Icon
                  className={clsx(
                    "w-5 h-5 transition-transform",
                    isActive ? `${theme.icon} scale-110` : "text-zinc-400"
                  )}
                  aria-hidden="true"
                />
                <span className="truncate max-w-[56px] text-center leading-none">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
