"use client";

import { formatDate } from "@/lib/dates";
import { formatEtb } from "@/lib/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type Column } from "@/components/shared/data-table";
import type { WasteRow, CertificateRow, InvoiceRow } from "@/types/view-models";
import { CancelWaste } from "./cancel-waste";

export const wasteColumns: Column<WasteRow>[] = [
  {
    key: "wasteCode",
    header: "Manifest Code",
    render: (r) => <span className="font-mono font-medium text-zinc-200">{r.wasteCode}</span>,
  },
  {
    key: "category",
    header: "Category",
    render: (r) => (
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{
            backgroundColor:
              r.category.colourCode === "YELLOW"
                ? "#eab308"
                : r.category.colourCode === "RED"
                  ? "#ef4444"
                  : r.category.colourCode === "BLUE"
                    ? "#3b82f6"
                    : "#71717a",
          }}
        />
        <span className="truncate max-w-[180px]">{r.category.name}</span>
      </div>
    ),
  },
  {
    key: "containerCount",
    header: "Containers",
    render: (r) => <span className="font-mono text-zinc-300">{r.containerCount} bins</span>,
  },
  {
    key: "weightKg",
    header: "Weight",
    render: (r) => <span className="font-mono text-zinc-200">{r.weightKg} kg</span>,
  },
  {
    key: "status",
    header: "Status",
    render: (r) => <StatusBadge status={r.status} size="sm" />,
  },
  {
    key: "createdAt",
    header: "Date Registered",
    render: (r) => (
      <span className="font-mono text-zinc-400 text-[11px]">{formatDate(r.createdAt)}</span>
    ),
  },
  {
    key: "id",
    header: "Labels",
    // Labels exist only while the waste waits for pickup (REGISTERED / SCHEDULED).
    render: (r) =>
      r.status === "REGISTERED" || r.status === "SCHEDULED" ? (
        <a
          href={`/api/waste/${r.id}/labels`}
          target="_blank"
          rel="noopener"
          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
        >
          Print labels
        </a>
      ) : (
        <span className="text-zinc-600 text-xs">—</span>
      ),
  },
  {
    key: "id",
    header: "",
    render: (r) =>
      r.status === "REGISTERED" || r.status === "SCHEDULED" ? (
        <CancelWaste id={r.id} wasteCode={r.wasteCode} />
      ) : null,
  },
];

export const certificateColumns: Column<CertificateRow>[] = [
  {
    key: "certificateNo",
    header: "Certificate #",
    render: (c) => (
      <span className="font-mono font-semibold text-emerald-400">{c.certificateNo}</span>
    ),
  },
  {
    key: "weightKg",
    header: "Neutralized Weight",
    render: (c) => (
      <span className="font-mono text-zinc-200">
        {c.weightKg} kg ({c.containerCount} units)
      </span>
    ),
  },
  {
    key: "methodCode",
    header: "Method",
    render: (c) => (
      <span className="text-zinc-300 text-[11px]">{c.methodCode.replace(/_/g, " ")}</span>
    ),
  },
  {
    key: "issuedOn",
    header: "Issue Date",
    render: (c) => <span className="font-mono text-zinc-400">{c.issuedOn ?? "—"}</span>,
  },
  {
    key: "status",
    header: "Verification",
    render: (c) => <StatusBadge status={c.status} size="sm" />,
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
        <span className="text-zinc-500 text-xs">Being prepared</span>
      ),
  },
];

export const invoiceColumns: Column<InvoiceRow>[] = [
  {
    key: "invoiceNo",
    header: "Invoice #",
    render: (inv) => <span className="font-mono font-medium text-zinc-200">{inv.invoiceNo}</span>,
  },
  {
    key: "billingPeriod",
    header: "Billing Period",
    render: (inv) => <span className="text-zinc-300">{inv.billingPeriod}</span>,
  },
  {
    key: "totalSantim",
    header: "Amount (ETB)",
    render: (inv) => (
      <span className="font-mono font-bold text-white">{formatEtb(inv.totalSantim)}</span>
    ),
  },
  {
    key: "dueDate",
    header: "Due Date",
    render: (inv) => <span className="font-mono text-zinc-400">{inv.dueDate ?? "—"}</span>,
  },
  {
    key: "status",
    header: "Status",
    render: (inv) => (
      <span className="inline-flex flex-wrap gap-1">
        <StatusBadge status={inv.status} size="sm" />
        {inv.overdue && <StatusBadge status="OVERDUE" size="sm" />}
      </span>
    ),
  },
  {
    key: "id",
    header: "PDF",
    render: (inv) => (
      <a
        href={`/api/invoices/${inv.id}/pdf`}
        className="text-emerald-400 underline text-xs"
        aria-label={`Download ${inv.invoiceNo}`}
      >
        Download
      </a>
    ),
  },
];

/*
 * Table components that take only data, so Server Components can render them (functions such as the column
 * renderers cannot be passed from the server to the client).
 */
interface TableProps<T> {
  rows: T[];
  title?: string;
  description?: string;
}

export function WasteTable({ rows, title, description }: TableProps<WasteRow>) {
  return (
    <DataTable
      title={title}
      description={description}
      data={rows}
      columns={wasteColumns}
      searchKey="wasteCode"
      searchPlaceholder="Search Waste ID..."
      emptyMessage="No waste registered yet"
    />
  );
}

export function CertificateTable({ rows, title, description }: TableProps<CertificateRow>) {
  return (
    <DataTable
      title={title}
      description={description}
      data={rows}
      columns={certificateColumns}
      searchKey="certificateNo"
      emptyMessage="No certificates yet"
    />
  );
}

export function InvoiceTable({ rows, title, description }: TableProps<InvoiceRow>) {
  return (
    <DataTable
      title={title}
      description={description}
      data={rows}
      columns={invoiceColumns}
      searchKey="invoiceNo"
      emptyMessage="No invoices"
    />
  );
}
