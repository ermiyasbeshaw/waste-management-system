"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDevSession } from "@/components/dev/dev-role-provider";
import { DevAccountMenu } from "@/components/dev/dev-account-menu";
import { useMobileSidebar } from "./mobile-sidebar-context";
import {
  Shield,
  LayoutDashboard,
  Truck,
  Flame,
  CreditCard,
  FileCheck,
  FileCheck2,
  MapPin,
  Building2,
  Activity,
  History,
  AlertCircle,
  ClipboardCheck,
  Pill,
  Users,
  Settings,
  KeyRound,
  X,
} from "lucide-react";
import { clsx } from "clsx";

export function Sidebar() {
  const pathname = usePathname();
  const { user, activeRole, devUsername } = useDevSession();
  const { isOpen, close } = useMobileSidebar();

  // All horizontal navigation items mapped into the sidebar for all roles.
  const getNavLinks = () => {
    switch (activeRole) {
      case "super_admin":
        return [
          { href: "/admin", label: "Overview", icon: LayoutDashboard },
          { href: "/admin/trips", label: "Trips", icon: MapPin },
          { href: "/admin/certificates", label: "Certificates", icon: FileCheck },
          { href: "/admin/fleet", label: "Live Fleet Radar", icon: Truck },
          { href: "/admin/fleet/manage", label: "Fleet & Licences", icon: Shield },
          { href: "/admin/facilities", label: "Facilities", icon: Building2 },
          { href: "/admin/users", label: "Users", icon: Users },
          { href: "/admin/finance", label: "Invoices & Billing", icon: CreditCard },
          { href: "/admin/contracts", label: "Contracts & Renewals", icon: FileCheck2 },
          { href: "/admin/categories", label: "Waste Categories", icon: Activity },
          { href: "/admin/alerts", label: "Alerts", icon: AlertCircle },
          { href: "/admin/settings", label: "Settings", icon: Settings },
        ];
      case "hospital_admin":
        return [
          { href: "/hospital", label: "Facility Overview", icon: Building2 },
          { href: "/hospital/waste", label: "Waste Records", icon: Activity },
          { href: "/hospital/stock", label: "Medicine Stock", icon: Pill },
          { href: "/hospital/stock/requests", label: "Disposal Requests", icon: ClipboardCheck },
          { href: "/hospital/certificates", label: "Destruction Certificates", icon: FileCheck },
          { href: "/hospital/invoices", label: "Billing & Invoices", icon: CreditCard },
          { href: "/hospital/users", label: "Users & Pickup Codes", icon: KeyRound },
        ];
      case "hospital_staff":
        return [
          { href: "/hospital", label: "Facility Overview", icon: Building2 },
          { href: "/hospital/waste", label: "Waste Records", icon: Activity },
          { href: "/hospital/stock", label: "Medicine Stock", icon: Pill },
          { href: "/hospital/stock/requests", label: "Disposal Requests", icon: ClipboardCheck },
          { href: "/hospital/certificates", label: "Destruction Certificates", icon: FileCheck },
        ];
      case "efda_officer":
        return [
          { href: "/regulator", label: "Volume Analytics & Trends", icon: Activity },
          { href: "/regulator/audit", label: "Immutable Audit Trail Ledger", icon: History },
          { href: "/regulator/certificates", label: "Certificates Registry", icon: FileCheck },
          { href: "/regulator/map", label: "Chain-of-Custody Route Map", icon: MapPin },
          { href: "/regulator/stock", label: "Medicine Stock", icon: Pill },
          { href: "/regulator/approvals", label: "Disposal Approvals", icon: ClipboardCheck },
        ];
      case "driver":
        return [
          { href: "/driver", label: "Today's Active Trip", icon: Truck },
          { href: "/driver/upcoming", label: "Upcoming Routes", icon: History },
        ];
      case "disposal_operator":
        return [
          { href: "/disposal", label: "Destruction Queue", icon: Flame },
          { href: "/disposal/inbound", label: "Inbound Trucks", icon: Truck },
          { href: "/disposal/exceptions", label: "Missing & Refused Exceptions", icon: AlertCircle },
        ];
      default:
        return [];
    }
  };

  if (!user) return null;

  const navLinks = getNavLinks();

  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const renderNavContent = (onLinkClick?: () => void) => (
    <>
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
          {onLinkClick ? (
            <button
              type="button"
              onClick={onLinkClick}
              aria-label="Close sidebar"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <div className="text-zinc-500 hover:text-zinc-300 cursor-pointer p-1 rounded-lg">
              <Activity className="w-4 h-4" />
            </div>
          )}
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
                onClick={onLinkClick}
                className={clsx(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group",
                  isActive
                    ? "bg-[#161622] text-white border border-white/[0.08] shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={clsx(
                      "w-4 h-4 transition-colors shrink-0",
                      isActive ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300"
                    )}
                  />
                  <span className="truncate">{link.label}</span>
                </div>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-glow shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer: development test login only (Clerk sessions sign out in the account menu) */}
      {devUsername && (
        <div className="p-4 border-t border-white/[0.06] shrink-0 mt-auto">
          <DevAccountMenu />
        </div>
      )}
    </>
  );

  return (
    <>
      {/* 1. Desktop Sticky Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#0a0a0d] border-r border-white/[0.07] flex-col justify-between shrink-0 h-screen sticky top-0 z-30 overflow-y-auto">
        {renderNavContent()}
      </aside>

      {/* 2. Mobile Responsive Slide-Out Drawer */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Sidebar"
          className="md:hidden fixed inset-0 z-50 flex animate-in fade-in"
        >
          {/* Dark Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={close}
          />

          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[85vw] bg-[#0a0a0d] border-r border-white/[0.1] h-full flex flex-col justify-between shadow-2xl z-10 overflow-y-auto animate-in slide-in-from-left duration-200">
            {renderNavContent(close)}
          </div>
        </div>
      )}
    </>
  );
}
