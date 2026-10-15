"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDevSession } from "@/components/dev/dev-role-provider";
import { DevAccountMenu } from "@/components/dev/dev-account-menu";
import {
  Shield,
  LayoutDashboard,
  Truck,
  Flame,
  CreditCard,
  FileCheck,
  MapPin,
  Building2,
  Activity,
  History,
  AlertCircle,
  ClipboardCheck,
  Pill,
} from "lucide-react";
import { clsx } from "clsx";

export function Sidebar() {
  const pathname = usePathname();
  const { user, activeRole, devUsername } = useDevSession();

  // One link per route (sub-routes since Gate 1a). Active = exact path match.
  const getNavLinks = () => {
    switch (activeRole) {
      case "super_admin":
        return [
          { href: "/admin", label: "Admin Panel", icon: LayoutDashboard },
          { href: "/admin/fleet", label: "Fleet Radar", icon: Truck },
          { href: "/admin/finance", label: "Invoices & Billing", icon: CreditCard },
          { href: "/admin/contracts", label: "Contracts & Renewals", icon: FileCheck },
          { href: "/admin/categories", label: "Waste Categories", icon: Activity },
          { href: "/admin/alerts", label: "System Alerts", icon: AlertCircle },
        ];
      case "hospital_admin":
      case "hospital_staff":
        return [
          { href: "/hospital", label: "Facility Station", icon: Building2 },
          { href: "/hospital/waste", label: "Waste Records", icon: Activity },
          { href: "/hospital/certificates", label: "Certificates", icon: FileCheck },
          { href: "/hospital/stock", label: "Medicine Stock", icon: Pill },
          // Invoices: hospital_admin only (CLAUDE.md §3).
          ...(activeRole === "hospital_admin"
            ? [{ href: "/hospital/invoices", label: "Billing & Invoices", icon: CreditCard }]
            : []),
        ];
      case "driver":
        return [
          { href: "/driver", label: "Today's Trip", icon: Truck },
          { href: "/driver/upcoming", label: "Upcoming Routes", icon: History },
        ];
      case "disposal_operator":
        return [
          { href: "/disposal", label: "Destruction Queue", icon: Flame },
          { href: "/disposal/inbound", label: "Inbound Trucks", icon: Truck },
          { href: "/disposal/exceptions", label: "Missing & Refused", icon: AlertCircle },
        ];
      case "efda_officer":
        return [
          { href: "/regulator", label: "Volume Analytics", icon: Activity },
          { href: "/regulator/audit", label: "Audit Ledger", icon: History },
          { href: "/regulator/certificates", label: "Certificates Registry", icon: FileCheck },
          { href: "/regulator/map", label: "Route Map", icon: MapPin },
          { href: "/regulator/stock", label: "Medicine Stock", icon: Pill },
          { href: "/regulator/approvals", label: "Disposal Approvals", icon: ClipboardCheck },
        ];
      default:
        return [];
    }
  };

  // No (dev) session, e.g. a production build before Gate 1b: no navigation to show.
  if (!user) return null;

  const navLinks = getNavLinks();

  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="w-64 bg-[#0a0a0d] border-r border-white/[0.07] flex flex-col justify-between shrink-0 h-screen sticky top-0 z-30">
      <div className="p-4 space-y-4">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 pt-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 flex items-center justify-center shadow-glow">
              <div className="w-full h-full bg-[#0a0a0d] rounded-full flex items-center justify-center">
                <Shield className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <span className="font-bold text-white text-base tracking-tight">SafeWaste</span>
          </div>
          <div className="text-zinc-500 hover:text-zinc-300 cursor-pointer p-1 rounded-lg">
            <Activity className="w-4 h-4" />
          </div>
        </div>

        {/* User Mini Profile Card */}
        <div className="bg-[#111116] border border-white/[0.07] rounded-2xl p-3.5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/[0.1] flex items-center justify-center text-xs font-bold text-zinc-200">
              {initials}
            </div>
            <div className="overflow-hidden">
              <div className="font-semibold text-xs text-white truncate">{user.fullName}</div>
              <div className="text-[11px] text-zinc-400 truncate">{user.roleTitle}</div>
            </div>
          </div>

          {/* Mini Stat Pills */}
          <div className="mt-3 pt-2.5 border-t border-white/[0.05] grid grid-cols-3 gap-1.5 text-center">
            <div className="bg-[#161620] rounded-lg py-1 px-1 border border-white/[0.04]">
              <div className="text-[9px] text-emerald-400 font-medium">Verified</div>
              <div className="text-[10px] text-zinc-300 font-mono font-bold">100%</div>
            </div>
            <div className="bg-[#161620] rounded-lg py-1 px-1 border border-white/[0.04]">
              <div className="text-[9px] text-zinc-400 font-medium">Active</div>
              <div className="text-[10px] text-zinc-300 font-mono font-bold">Dire Dawa</div>
            </div>
            <div className="bg-[#161620] rounded-lg py-1 px-1 border border-white/[0.04]">
              <div className="text-[9px] text-cyan-400 font-medium">Status</div>
              <div className="text-[10px] text-zinc-300 font-mono font-bold">LIVE</div>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="space-y-1 pt-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;

            return (
              <Link
                key={link.label}
                href={link.href}
                className={clsx(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group",
                  isActive
                    ? "bg-[#161622] text-white border border-white/[0.08] shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={clsx(
                      "w-4 h-4 transition-colors",
                      isActive ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300"
                    )}
                  />
                  <span>{link.label}</span>
                </div>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-glow" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer: development test login only (Clerk sessions sign out in the account menu) */}
      {devUsername && (
        <div className="p-4 border-t border-white/[0.06]">
          <DevAccountMenu />
        </div>
      )}
    </aside>
  );
}
