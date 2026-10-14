"use client";

import { formatDate, formatTime } from "@/lib/dates";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Column } from "@/components/shared/data-table";
import type { QueueContainer, ExceptionContainer } from "@/types/view-models";

export const queueColumns: Column<QueueContainer>[] = [
  {
    key: "containerCode",
    header: "Container Code",
    render: (c) => (
      <div>
        <span className="font-mono font-bold text-white block">{c.containerCode}</span>
        <span className="font-mono text-[10px] text-zinc-500">Waste ID: {c.wasteCode}</span>
      </div>
    ),
  },
  {
    key: "facilityName",
    header: "Source Hospital",
    render: (c) => <span className="text-zinc-200 font-medium">{c.facility.name}</span>,
  },
  {
    key: "category",
    header: "Category & MoH Color",
    render: (c) => (
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{
            backgroundColor:
              c.category.colourCode === "YELLOW"
                ? "#eab308"
                : c.category.colourCode === "RED"
                  ? "#ef4444"
                  : c.category.colourCode === "BLUE"
                    ? "#3b82f6"
                    : "#b45309",
          }}
        />
        <span className="text-zinc-300">{c.category.name}</span>
      </div>
    ),
  },
  {
    key: "receivedAt",
    header: "Received At Yard",
    render: (c) => (
      <span className="font-mono text-zinc-400 text-[11px]">
        {c.receivedAt ? formatTime(c.receivedAt) : "-"}
      </span>
    ),
  },
  {
    key: "status",
    header: "Queue State",
    render: (c) => <StatusBadge status={c.status} size="sm" />,
  },
];

export const exceptionsColumns: Column<ExceptionContainer>[] = [
  {
    key: "containerCode",
    header: "Container Code",
    render: (c) => <span className="font-mono font-bold text-rose-400">{c.containerCode}</span>,
  },
  {
    key: "facilityName",
    header: "Facility",
    render: (c) => <span className="text-zinc-200">{c.facility.name}</span>,
  },
  {
    key: "status",
    header: "Exception Type",
    render: (c) => <StatusBadge status={c.status} size="sm" />,
  },
  {
    key: "reason",
    header: "Incident Notes & Root Cause",
    render: (c) => (
      <p className="text-xs text-rose-300 max-w-md font-medium">
        {c.reason || "Pending investigation"}
      </p>
    ),
  },
  {
    key: "at",
    header: "Incident Date",
    render: (c) => <span className="font-mono text-zinc-400 text-[11px]">{formatDate(c.at)}</span>,
  },
];
