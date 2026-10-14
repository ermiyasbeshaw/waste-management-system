"use client";

import React, { useState } from "react";
import { CreditCard, DollarSign, Calendar } from "lucide-react";
import { formatEtb } from "@/lib/money";
import { KpiCard } from "@/components/shared/kpi-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, Column } from "@/components/shared/data-table";
import type { AdminKpis, InvoiceRow } from "@/types/view-models";
import { InvoiceActions, MonthlyInvoicesPanel } from "./invoice-actions";

export function InvoicesLedger({ data }: { data: { kpis: AdminKpis; invoices: InvoiceRow[] } }) {
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>("ALL");

  const filteredInvoices =
    invoiceStatusFilter === "ALL"
      ? data.invoices
      : invoiceStatusFilter === "OVERDUE"
        ? data.invoices.filter((i) => i.overdue)
        : data.invoices.filter((i) => i.status === invoiceStatusFilter);

  const invoiceColumns: Column<InvoiceRow>[] = [
    {
      key: "invoiceNo",
      header: "Invoice #",
      render: (inv) => <span className="font-mono font-bold text-white">{inv.invoiceNo}</span>,
    },
    {
      key: "facilityName",
      header: "Facility",
      render: (inv) => <span className="text-zinc-200">{inv.facility.name}</span>,
    },
    {
      key: "totalSantim",
      header: "Amount (ETB)",
      render: (inv) => (
        <span className="font-mono font-bold text-white">{formatEtb(inv.totalSantim)}</span>
      ),
    },
    {
      key: "issuedOn",
      header: "Issue Date",
      render: (inv) => <span className="font-mono text-zinc-400">{inv.issuedOn}</span>,
    },
    {
      key: "dueDate",
      header: "Due Date",
      render: (inv) => <span className="font-mono text-zinc-400">{inv.dueDate}</span>,
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
      header: "Actions",
      render: (inv) => <InvoiceActions invoice={inv} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Outstanding Balance (ETB)"
          value={formatEtb(data.kpis.outstandingSantim)}
          subtitle={`${data.kpis.outstandingCount} issued, not settled`}
          icon={CreditCard}
          color="amber"
        />
        <KpiCard
          title="Settled Revenue (ETB)"
          value={formatEtb(data.kpis.settledSantim)}
          subtitle={`${data.kpis.settledCount} settled offline`}
          icon={DollarSign}
          color="emerald"
        />
        <KpiCard
          title="Draft Invoices"
          value={data.kpis.draftCount}
          subtitle="Not yet issued to facilities"
          icon={Calendar}
          color="purple"
        />
      </div>

      <MonthlyInvoicesPanel />

      <DataTable
        title="Healthcare Facility Invoices Ledger"
        description="Accounts receivable and billing records in ETB"
        data={filteredInvoices}
        columns={invoiceColumns}
        searchKey="invoiceNo"
        searchPlaceholder="Search invoice # or hospital..."
        filterComponent={
          <select
            value={invoiceStatusFilter}
            onChange={(e) => setInvoiceStatusFilter(e.target.value)}
            className="bg-[#161622] text-xs text-zinc-300 border border-white/[0.08] rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="ISSUED">Issued</option>
            <option value="OVERDUE">Overdue (issued, past due)</option>
            <option value="SETTLED_OFFLINE">Settled (offline)</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        }
      />
    </div>
  );
}
