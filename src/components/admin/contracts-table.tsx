"use client";

import { Calendar, FileWarning } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatEtb } from "@/lib/money";
import type { ContractRow, FacilityRef } from "@/types/view-models";
import { EditContract, NewContractForm } from "./contract-editor";

export function ContractsTable({
  data,
  facilities,
}: {
  data: { contracts: ContractRow[]; uncontractedFacilities: FacilityRef[] };
  /** Health facilities that can get a contract (for the "New contract" form). */
  facilities: FacilityRef[];
}) {
  const contractColumns: Column<ContractRow>[] = [
    {
      key: "contractCode",
      header: "Contract #",
      render: (c) => <span className="font-mono font-bold text-white">{c.contractCode}</span>,
    },
    {
      key: "facilityName",
      header: "Facility Name",
      render: (c) => <span className="text-zinc-200">{c.facility.name}</span>,
    },
    {
      key: "endDate",
      header: "Expiration Date",
      render: (c) => <span className="font-mono text-zinc-300">{c.endDate}</span>,
    },
    {
      key: "daysUntilExpiry",
      header: "Days Remaining",
      render: (c) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Calendar className="w-3 h-3" />
          <span>{c.daysUntilExpiry <= 0 ? "Ended" : `${c.daysUntilExpiry} days`}</span>
        </span>
      ),
    },
    {
      key: "monthlyFeeSantim",
      header: "Monthly Fee",
      render: (c) => (
        <span className="font-mono text-zinc-300">{formatEtb(c.monthlyFeeSantim)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => <StatusBadge status={c.status} size="sm" />,
    },
    {
      key: "id",
      header: "Change",
      render: (c) => <EditContract contract={c} />,
    },
  ];

  return (
    <div className="space-y-6">
      <NewContractForm facilities={facilities} />
      {data.uncontractedFacilities.length > 0 && (
        <div className="bg-[#181115] border border-rose-500/30 rounded-2xl p-4 flex items-center gap-3 text-rose-300 text-xs">
          <FileWarning className="w-5 h-5 shrink-0 text-rose-400" />
          <div>
            <span className="font-semibold text-white">Compliance Alert: </span>
            {data.uncontractedFacilities.length} healthcare facility(ies) without an active service
            contract: {data.uncontractedFacilities.map((f) => f.name).join(", ")}.
          </div>
        </div>
      )}

      <DataTable
        title="Service Contracts & Imminent Expirations"
        description="Hospital disposal service agreements and renewal countdowns"
        data={data.contracts}
        columns={contractColumns}
        getSearchText={(c) => c.facility.name}
      />
    </div>
  );
}
