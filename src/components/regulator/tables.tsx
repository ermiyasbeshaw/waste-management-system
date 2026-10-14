"use client";

import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDateTime } from "@/lib/dates";
import type { AuditRow, CertificateRow, FacilityVolume } from "@/types/view-models";

export function CertificatesRegistryTable({ rows }: { rows: CertificateRow[] }) {
  const certColumns: Column<CertificateRow>[] = [
    {
      key: "certificateNo",
      header: "Certificate #",
      render: (c) => <span className="font-mono font-bold text-white">{c.certificateNo}</span>,
    },
    {
      key: "facility",
      header: "Originating Hospital",
      render: (c) => <span className="text-zinc-200">{c.facility.name}</span>,
    },
    {
      key: "weightKg",
      header: "Weight (Kg)",
      render: (c) => (
        <span className="font-mono text-zinc-200">
          {c.weightKg} kg ({c.containerCount} units)
        </span>
      ),
    },
    {
      key: "methodCode",
      header: "Neutralization Method",
      render: (c) => (
        <span className="text-zinc-300 text-xs">{c.methodCode.replace(/_/g, " ")}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => <StatusBadge status={c.status} size="sm" />,
    },
    {
      key: "verifyToken",
      header: "Verification Token",
      render: (c) => <span className="font-mono text-[11px] text-zinc-400">{c.verifyToken}</span>,
    },
    {
      key: "id",
      header: "PDF",
      render: (c) =>
        c.status === "ISSUED" || c.status === "REVOKED" ? (
          <a
            href={`/api/certificates/${c.id}/pdf`}
            className="text-emerald-400 underline text-xs"
            aria-label={`Download ${c.certificateNo}`}
          >
            Download
          </a>
        ) : (
          <span className="text-zinc-500 text-xs">—</span>
        ),
    },
  ];

  return (
    <DataTable
      title="National Destruction Certificates Ledger"
      description="Verified and revoked certificates with verification tokens"
      data={rows}
      columns={certColumns}
      searchKey="certificateNo"
    />
  );
}

export function AuditLedgerTable({ rows }: { rows: AuditRow[] }) {
  const auditColumns: Column<AuditRow>[] = [
    {
      key: "action",
      header: "System Event",
      // An audit action is an event name, not a status: shown as plain text.
      render: (log) => (
        <span className="inline-flex px-2 py-0.5 rounded-md bg-zinc-800/60 border border-zinc-700/50 font-mono text-[10px] text-zinc-300 break-all">
          {log.action}
        </span>
      ),
    },
    {
      key: "actorName",
      header: "Actor & Role",
      render: (log) => (
        <div>
          <span className="font-medium text-white block">{log.actorName ?? "System job"}</span>
          <span className="text-[10px] text-zinc-500 uppercase font-mono">
            {log.role ?? "system"}
          </span>
        </div>
      ),
    },
    {
      key: "facilityName",
      header: "Facility Scope",
      render: (log) => <span className="text-zinc-300">{log.facilityName || "—"}</span>,
    },
    {
      key: "summary",
      header: "Immutable Ledger Event Details",
      render: (log) => <p className="text-xs text-zinc-300 max-w-md font-mono">{log.summary}</p>,
    },
    {
      key: "ip",
      header: "Client IP",
      render: (log) => <span className="font-mono text-[11px] text-zinc-500">{log.ip ?? "—"}</span>,
    },
    {
      key: "at",
      header: "Timestamp",
      render: (log) => (
        <span className="font-mono text-zinc-400 text-[11px]">{formatDateTime(log.at)}</span>
      ),
    },
  ];

  return (
    <DataTable
      title="Tamper-Proof Audit Trail Ledger"
      description="Append-only, hash-chained log of every change: registrations, handovers, overrides, destruction, certificates and invoices (newest first)"
      data={rows}
      columns={auditColumns}
      searchKey="summary"
      searchPlaceholder="Search audit details, users or IPs..."
    />
  );
}

export function FacilityLeagueTable({ rows }: { rows: FacilityVolume[] }) {
  const columns: Column<FacilityVolume>[] = [
    {
      key: "name",
      header: "Facility Name",
      render: (f) => (
        <div>
          <span className="font-semibold text-white block">{f.name}</span>
          <span className="font-mono text-[10px] text-zinc-500">{f.code}</span>
        </div>
      ),
    },
    {
      key: "kg",
      header: "Total Volume (Kg)",
      render: (f) => (
        <span className="font-mono font-bold text-white">{f.kg.toLocaleString()} kg</span>
      ),
    },
    {
      key: "containers",
      header: "Container Units",
      render: (f) => <span className="font-mono text-zinc-300">{f.containers} Bins</span>,
    },
  ];

  return (
    <DataTable
      title="Facility Waste Generation League"
      description="Volumes generated per medical institution"
      data={rows}
      columns={columns}
      searchKey="name"
    />
  );
}
