"use client";

import React, { createContext, useContext } from "react";
import { CalendarClock, Truck } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";
import { BottomNav } from "@/components/mobile/bottom-nav";
import type { DriverDashboardData } from "@/types/view-models";

const DriverContext = createContext<DriverDashboardData | null>(null);

export function useDriverData(): DriverDashboardData {
  const ctx = useContext(DriverContext);
  if (!ctx) throw new Error("useDriverData must be used inside DriverShell");
  return ctx;
}

/**
 * Mobile shell for /driver: driver summary, page content, bottom navigation. `data` is loaded on the server by
 * the driver layout (src/server/queries/driver.ts — the signed-in driver's own trips only).
 */
export function DriverShell({
  data,
  children,
}: {
  data: DriverDashboardData | null;
  children: React.ReactNode;
}) {
  if (!data) {
    return (
      <ErrorState
        title="No driver profile for this account"
        description="Your account has the driver role but no driver profile (vehicle, licence) yet."
      />
    );
  }

  return (
    <DriverContext.Provider value={data}>
      <div className="space-y-4">
        <section className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
            <Truck className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white leading-tight">Driver Mobile Console</h1>
            <p className="text-sm text-zinc-400 truncate">
              {data.driver.name} · {data.driver.licenseNo}
              {data.driver.vehiclePlate ? ` · ${data.driver.vehiclePlate}` : ""}
            </p>
          </div>
        </section>

        {children}
      </div>

      <BottomNav
        label="Driver navigation"
        accent="amber"
        items={[
          { href: "/driver", label: "Today", icon: Truck },
          {
            href: "/driver/upcoming",
            label: "Upcoming",
            icon: CalendarClock,
            count: data.upcomingTrips.length,
          },
        ]}
      />
    </DriverContext.Provider>
  );
}
