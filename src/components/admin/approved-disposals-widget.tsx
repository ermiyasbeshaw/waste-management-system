"use client";

import { useState, useTransition } from "react";
import {
  QrCode,
  FileText,
  Truck,
  Building2,
  CheckCircle2,
  Clock,
  UserCheck,
  AlertCircle,
  Car,
} from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { DisposalQrModal } from "@/components/medicine/disposal-qr-modal";
import { assignDriverToRequestAction } from "@/app/(desk)/hospital/stock/actions";
import type { DisposalRequestRow } from "@/types/view-models";

type DriverOption = {
  id: string;
  full_name: string;
  email: string | null;
  license_no?: string | null;
  default_vehicle_id?: string | null;
  default_plate_no?: string | null;
};

type VehicleOption = {
  id: string;
  plate_no: string;
  model: string | null;
  capacity_kg: string;
};

export function ApprovedDisposalsWidget({
  rows,
  drivers = [],
  vehicles = [],
}: {
  rows: DisposalRequestRow[];
  drivers?: DriverOption[];
  vehicles?: VehicleOption[];
}) {
  const [activeQrRow, setActiveQrRow] = useState<DisposalRequestRow | null>(null);
  const [filter, setFilter] = useState<
    "ALL" | "PENDING_DRIVER" | "APPROVED" | "IN_TRANSIT" | "AT_FACILITY" | "DISPOSED"
  >("ALL");

  const [selectedDrivers, setSelectedDrivers] = useState<Record<string, string>>({});
  const [selectedVehicles, setSelectedVehicles] = useState<Record<string, string>>({});
  const [assignmentNotice, setAssignmentNotice] = useState<{
    id: string;
    ok: boolean;
    text: string;
  } | null>(null);
  const [isAssigning, startAssigning] = useTransition();

  const onDriverChange = (reqId: string, driverId: string) => {
    setSelectedDrivers((prev) => ({ ...prev, [reqId]: driverId }));
    const d = drivers.find((x) => x.id === driverId);
    if (d?.default_vehicle_id) {
      setSelectedVehicles((prev) => ({ ...prev, [reqId]: d.default_vehicle_id! }));
    }
  };

  const handleAssignDriver = (requestId: string) => {
    const driverId = selectedDrivers[requestId];
    const vehicleId = selectedVehicles[requestId] || null;
    if (!driverId) {
      setAssignmentNotice({ id: requestId, ok: false, text: "Please select an active driver." });
      return;
    }
    setAssignmentNotice(null);
    startAssigning(async () => {
      const res = await assignDriverToRequestAction(requestId, driverId, vehicleId);
      if (res.ok) {
        setAssignmentNotice({
          id: requestId,
          ok: true,
          text: `Driver and vehicle successfully assigned! Request is now Approved for driver collection.`,
        });
      } else {
        setAssignmentNotice({ id: requestId, ok: false, text: res.message });
      }
    });
  };

  const pendingDriverRequests = rows.filter(
    (r) => r.status === "PENDING_DRIVER_ASSIGNMENT" || (r.status === "APPROVED" && !r.driverName)
  );

  const filtered = rows.filter((r) => {
    if (filter === "ALL") return true;
    if (filter === "PENDING_DRIVER") {
      return r.status === "PENDING_DRIVER_ASSIGNMENT" || (r.status === "APPROVED" && !r.driverName);
    }
    if (filter === "APPROVED") return r.status === "APPROVED";
    if (filter === "IN_TRANSIT") return r.status === "RECEIVED_BY_DRIVER";
    if (filter === "AT_FACILITY") return r.status === "RECEIVED_AT_FACILITY";
    if (filter === "DISPOSED") return r.status === "DISPOSED";
    return true;
  });

  return (
    <div className="bg-[#111116] border border-white/[0.08] rounded-2xl p-5 space-y-5 shadow-xl">
      {activeQrRow && (
        <DisposalQrModal
          row={activeQrRow}
          open={Boolean(activeQrRow)}
          onClose={() => setActiveQrRow(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">
              Medical Waste Disposal & Driver Assignment
            </h3>
            {pendingDriverRequests.length > 0 && (
              <span className="text-xs bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                {pendingDriverRequests.length} Needs Driver Assignment
              </span>
            )}
            <span className="text-xs bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 font-mono px-2 py-0.5 rounded-full font-semibold">
              Live QR Tracking
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Super Admin driver and vehicle assignment & real-time lifecycle tracking across hospital, collection, and facility
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1 bg-[#161622] p-1 rounded-xl border border-white/[0.06] text-xs">
          {(
            [
              ["ALL", `All (${rows.length})`],
              [
                "PENDING_DRIVER",
                `Awaiting Driver (${rows.filter((r) => r.status === "PENDING_DRIVER_ASSIGNMENT").length})`,
              ],
              ["APPROVED", `Ready / Approved (${rows.filter((r) => r.status === "APPROVED").length})`],
              ["IN_TRANSIT", `In Transit (${rows.filter((r) => r.status === "RECEIVED_BY_DRIVER").length})`],
              ["AT_FACILITY", `At Facility (${rows.filter((r) => r.status === "RECEIVED_AT_FACILITY").length})`],
              ["DISPOSED", `Disposed (${rows.filter((r) => r.status === "DISPOSED").length})`],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setFilter(val)}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                filter === val
                  ? "bg-amber-500 text-black font-semibold shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Prominent Section: Awaiting Driver Assignment */}
      {pendingDriverRequests.length > 0 && (
        <section className="bg-amber-500/[0.06] border border-amber-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-400">
            <Truck className="w-4 h-4 shrink-0" />
            <h4 className="text-sm font-bold">
              Approved Requests Waiting for Driver Assignment ({pendingDriverRequests.length})
            </h4>
          </div>
          <p className="text-xs text-zinc-300">
            These disposal requests have received all required approvals (Hospital Administrator & EFDA if expired medicine). Assign an authorized driver and vehicle to initiate collection and generate the official waste record.
          </p>

          <div className="space-y-3">
            {pendingDriverRequests.map((req) => (
              <div
                key={req.id}
                className="bg-[#161622] border border-white/[0.08] rounded-xl p-3.5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">{req.requestCode}</span>
                      <StatusBadge status={req.status} size="sm" />
                      <span className="text-xs text-zinc-300 font-medium">
                        {req.facility.name} ({req.facility.code})
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        Volume: <strong className="text-zinc-200">{req.weightKg} kg</strong> ({req.containerCount} containers)
                      </span>
                      <span>
                        Items: <strong className="text-zinc-200">{req.lines.length} medicines</strong>
                      </span>
                      <span>Scheduled: {req.scheduledDate ?? "Immediate"}</span>
                    </div>
                    {req.note && (
                      <p className="text-xs text-zinc-400 italic">Note: {req.note}</p>
                    )}
                  </div>

                  {/* Driver & Vehicle Assignment Form */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Driver Selector */}
                    <select
                      aria-label={`Select driver for ${req.requestCode}`}
                      value={selectedDrivers[req.id] ?? ""}
                      onChange={(e) => onDriverChange(req.id, e.target.value)}
                      className="min-h-[38px] bg-[#111116] border border-white/[0.15] rounded-xl px-3 text-xs text-zinc-100 font-medium focus:outline-none focus:border-amber-400"
                    >
                      <option value="">-- Select Driver --</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name} {d.default_plate_no ? `(Def: ${d.default_plate_no})` : ""}
                        </option>
                      ))}
                    </select>

                    {/* Vehicle Selector */}
                    <select
                      aria-label={`Select vehicle for ${req.requestCode}`}
                      value={selectedVehicles[req.id] ?? ""}
                      onChange={(e) =>
                        setSelectedVehicles((prev) => ({ ...prev, [req.id]: e.target.value }))
                      }
                      className="min-h-[38px] bg-[#111116] border border-white/[0.15] rounded-xl px-3 text-xs text-zinc-100 font-medium focus:outline-none focus:border-amber-400"
                    >
                      <option value="">-- Select Vehicle (Optional) --</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.plate_no} {v.model ? `(${v.model})` : ""} [{v.capacity_kg} kg]
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={isAssigning || !selectedDrivers[req.id]}
                      onClick={() => handleAssignDriver(req.id)}
                      className="min-h-[38px] px-4 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 shadow-md disabled:opacity-40 transition-colors"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      {isAssigning ? "Assigning..." : "Assign Driver & Vehicle"}
                    </button>
                  </div>
                </div>

                {assignmentNotice?.id === req.id && (
                  <div
                    className={`text-xs p-2.5 rounded-lg ${
                      assignmentNotice.ok
                        ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-300 border border-rose-500/30"
                    }`}
                  >
                    {assignmentNotice.text}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No disposal requests found"
          description="Disposal requests matching your selected filter will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="text-zinc-500 bg-[#161622]/60 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3 rounded-l-xl">Request / Facility</th>
                <th className="py-2.5 px-3">Volume</th>
                <th className="py-2.5 px-3">QR Pass</th>
                <th className="py-2.5 px-3">Driver Assignment / Scan</th>
                <th className="py-2.5 px-3">Disposal Facility</th>
                <th className="py-2.5 px-3 rounded-r-xl">Certificate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{r.requestCode}</span>
                      <StatusBadge status={r.status} size="sm" />
                    </div>
                    <p className="text-zinc-400 text-[11px] mt-0.5">
                      {r.facility.name} ({r.facility.code})
                    </p>
                    <span className="text-zinc-500 text-[10px]">
                      Scheduled: {r.scheduledDate ?? "Immediate"}
                    </span>
                  </td>

                  <td className="py-3 px-3 font-mono">
                    <div className="text-zinc-200 font-semibold">{r.weightKg} kg</div>
                    <div className="text-zinc-400 text-[11px]">{r.containerCount} container(s)</div>
                    <div className="text-zinc-500 text-[10px]">{r.lines.length} medicine item(s)</div>
                  </td>

                  <td className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => setActiveQrRow(r)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border border-white/[0.08] transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                      View QR
                    </button>
                    <span className="text-[10px] font-mono text-zinc-500 block mt-1 truncate max-w-[120px]">
                      {r.qrCode}
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    {r.status === "PENDING_DRIVER_ASSIGNMENT" || (r.status === "APPROVED" && !r.driverName) ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1 text-amber-400 font-medium text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Needs Driver</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <select
                            aria-label={`Assign driver for ${r.requestCode}`}
                            value={selectedDrivers[r.id] ?? ""}
                            onChange={(e) => onDriverChange(r.id, e.target.value)}
                            className="bg-[#161622] border border-white/[0.1] rounded-lg px-2 py-1 text-[11px] text-zinc-200 max-w-[120px]"
                          >
                            <option value="">Driver...</option>
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.full_name}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label={`Assign vehicle for ${r.requestCode}`}
                            value={selectedVehicles[r.id] ?? ""}
                            onChange={(e) =>
                              setSelectedVehicles((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            className="bg-[#161622] border border-white/[0.1] rounded-lg px-2 py-1 text-[11px] text-zinc-200 max-w-[110px]"
                          >
                            <option value="">Vehicle...</option>
                            {vehicles.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.plate_no}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={isAssigning || !selectedDrivers[r.id]}
                            onClick={() => handleAssignDriver(r.id)}
                            className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold rounded-lg disabled:opacity-40"
                          >
                            Assign
                          </button>
                        </div>
                      </div>
                    ) : r.driverScannedAt ? (
                      <div className="flex items-start gap-1.5 text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold block">Received by Driver</span>
                          <span className="text-[10px] text-zinc-400 block">
                            {r.driverName ?? "Assigned Driver"}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {formatDateTime(r.driverScannedAt)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <Clock className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                        <div>
                          <span className="text-[11px] text-zinc-300 block font-medium">
                            {r.driverName ? `Assigned: ${r.driverName}` : "Pending pickup"}
                          </span>
                          <span className="text-[10px] text-zinc-500 italic">Awaiting driver scan</span>
                        </div>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    {r.operatorScannedAt ? (
                      <div className="flex items-start gap-1.5 text-blue-300">
                        <Building2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold block">At Disposal Facility</span>
                          <span className="text-[10px] text-zinc-400 block">
                            {r.operatorName ?? "Operator"}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {formatDateTime(r.operatorScannedAt)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-zinc-500">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="italic">Pending arrival</span>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    {r.status === "DISPOSED" ? (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Disposed
                        </span>
                        <div>
                          <a
                            href={`/api/certificates/disposal/${r.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors"
                          >
                            <FileText className="w-3 h-3" />
                            Certificate PDF
                          </a>
                        </div>
                      </div>
                    ) : (
                      <span className="text-zinc-500 italic">In progress</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
