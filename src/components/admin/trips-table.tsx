"use client";

import { Truck } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, Column } from "@/components/shared/data-table";
import type { TripRow } from "@/types/view-models";

export function TripsTable({ rows }: { rows: TripRow[] }) {
  const tripColumns: Column<TripRow>[] = [
    {
      key: "tripCode",
      header: "Trip Code",
      render: (t) => <span className="font-mono text-zinc-200 font-medium">{t.tripCode}</span>,
    },
    {
      key: "vehiclePlate",
      header: "Vehicle Plate",
      render: (t) => (
        <div className="flex items-center gap-2">
          <Truck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono font-medium">{t.vehiclePlate}</span>
        </div>
      ),
    },
    {
      key: "driverName",
      header: "Driver",
      render: (t) => <span className="text-zinc-300">{t.driverName}</span>,
    },
    {
      key: "stopsCompleted",
      header: "Stops Progress",
      render: (t) => (
        <div className="flex items-center gap-2">
          <div className="w-16 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-400 h-full rounded-full"
              style={{
                width: `${Math.round((t.stopsCompleted / t.stopsTotal) * 100)}%`,
              }}
            />
          </div>
          <span className="text-[11px] font-mono text-zinc-400">
            {t.stopsCompleted}/{t.stopsTotal}
          </span>
        </div>
      ),
    },
    {
      key: "weightKgTotal",
      header: "Payload (Kg)",
      render: (t) => <span className="font-mono text-zinc-300">{t.weightKgTotal} kg</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <StatusBadge status={t.status} size="sm" />,
    },
  ];

  return (
    <DataTable
      title="Today's Active & Scheduled Trips"
      description="Fleet operations deployed in Dire Dawa and nearby catchment zones"
      data={rows}
      columns={tripColumns}
      searchKey="vehiclePlate"
      searchPlaceholder="Filter trips by vehicle plate..."
    />
  );
}
