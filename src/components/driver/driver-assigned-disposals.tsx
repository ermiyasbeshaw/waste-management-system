"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Package,
  Truck,
  QrCode,
  Hospital,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Phone,
  Mail,
  Car,
  Building2,
  ShieldCheck,
  FileCheck2,
  X,
  Scan,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  getDriverAssignedRequestsAction,
  scanRequestByDriverAction,
} from "@/app/(desk)/hospital/stock/actions";

type AssignedDisposal = {
  id: string;
  request_code: string;
  status: string;
  facility_id: string;
  facility_name: string;
  facility_code: string;
  facility_address: string;
  facility_city: string | null;
  facility_sub_city: string | null;
  facility_woreda: string | null;
  facility_region: string;
  facility_lat: number;
  facility_lng: number;
  requested_by_name: string;
  requester_email: string | null;
  requester_phone: string | null;
  category_name: string;
  category_code: string;
  container_count: number;
  weight_kg: string;
  scheduled_date: string | null;
  note: string | null;
  qr_code: string | null;
  created_at: string;
  hospital_decided_by_name: string | null;
  decided_at: string | null;
  contains_expired: boolean;
  efda_decided_by_name: string | null;
  efda_decided_at: string | null;
  efda_decision_reason: string | null;
  assigned_by_name: string | null;
  assigned_at: string | null;
  vehicle_id: string | null;
  vehicle_plate_no: string | null;
  vehicle_model: string | null;
  vehicle_capacity_kg: string | null;
  destination_facility_id: string | null;
  destination_name: string | null;
  destination_code: string | null;
  destination_address: string | null;
  destination_city: string | null;
  driver_scanned_at: string | null;
  operator_name: string | null;
  operator_scanned_at: string | null;
  disposed_at: string | null;
  certificate_no: string | null;
  lines: {
    item: string;
    strength: string;
    form: string;
    batch: string;
    quantity: number;
    unit: string;
    expiry_date: string;
    is_expired: boolean;
  }[];
};

export function DriverAssignedDisposals() {
  const [requests, setRequests] = useState<AssignedDisposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Scan modal state
  const [scanModalReq, setScanModalReq] = useState<AssignedDisposal | null>(null);
  const [scannedInput, setScannedInput] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const [isScanning, startScan] = useTransition();

  const fetchRequests = async () => {
    setIsLoading(true);
    const res = await getDriverAssignedRequestsAction();
    if (res.ok) {
      setRequests(res.data as unknown as AssignedDisposal[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const openScanModal = (req: AssignedDisposal) => {
    setScanModalReq(req);
    setScannedInput("");
    setScanError(null);
    setScanSuccess(null);
  };

  const closeScanModal = () => {
    setScanModalReq(null);
    setScannedInput("");
    setScanError(null);
    setScanSuccess(null);
  };

  const handleExecuteScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scannedInput.trim();
    if (!code) {
      setScanError("Please scan or enter the hospital's QR code.");
      return;
    }
    setScanError(null);
    setScanSuccess(null);

    startScan(async () => {
      const res = await scanRequestByDriverAction(code);
      if (res.ok) {
        setScanSuccess(`QR Code verified successfully! Request marked as Received by Driver.`);
        fetchRequests();
        setTimeout(() => {
          closeScanModal();
        }, 1500);
      } else {
        setScanError(res.message);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="bg-[#111116] border border-white/[0.08] rounded-2xl p-4 text-center text-xs text-zinc-400">
        Loading assigned disposal pickups...
      </div>
    );
  }

  const pendingPickups = requests.filter((r) => r.status === "APPROVED");

  const renderScanModal = () => {
    if (!scanModalReq) return null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-scan-title"
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      >
        <div className="bg-[#111116] border border-amber-500/40 rounded-2xl p-5 w-full max-w-md space-y-4 shadow-2xl relative">
          <button
            type="button"
            onClick={closeScanModal}
            className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg"
            aria-label="Close scan modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5 text-amber-400">
            <Scan className="w-5 h-5 shrink-0" />
            <div>
              <h3 id="driver-scan-title" className="text-base font-bold text-white">
                Scan QR Code for Waste Pickup
              </h3>
              <p className="text-xs text-zinc-400">
                {scanModalReq.request_code} · {scanModalReq.facility_name}
              </p>
            </div>
          </div>

          {scanModalReq.id ? (
            <div className="p-3 bg-[#161622] rounded-xl border border-white/[0.06] text-xs space-y-1 text-zinc-300">
              <p>
                <strong>Origin:</strong> {scanModalReq.facility_name} ({scanModalReq.facility_code})
              </p>
              <p>
                <strong>Weight:</strong> {scanModalReq.weight_kg} kg ({scanModalReq.container_count} containers)
              </p>
            </div>
          ) : (
            <div className="p-3 bg-[#161622] rounded-xl border border-white/[0.06] text-xs text-zinc-300">
              <p>Scan or enter the unique QR code on the hospital disposal package to record handover.</p>
            </div>
          )}

          <form onSubmit={handleExecuteScan} className="space-y-3">
            <div>
              <label htmlFor="scan-code-input" className="block text-xs font-semibold text-zinc-300 mb-1">
                Scan QR Code or Enter Token:
              </label>
              <div className="relative">
                <input
                  id="scan-code-input"
                  type="text"
                  value={scannedInput}
                  onChange={(e) => setScannedInput(e.target.value)}
                  placeholder="e.g. QR-MD-2026-..."
                  autoFocus
                  className="w-full min-h-[44px] bg-[#161622] border border-amber-500/40 rounded-xl px-3.5 text-sm font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {scanError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{scanError}</span>
              </div>
            )}

            {scanSuccess && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-start gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{scanSuccess}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={closeScanModal}
                className="flex-1 min-h-[42px] rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isScanning || !scannedInput.trim()}
                className="flex-1 min-h-[42px] rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                <QrCode className="w-4 h-4" />
                {isScanning ? "Validating & Recording..." : "Confirm & Receive Waste"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (requests.length === 0) {
    return (
      <>
        {renderScanModal()}
        <section className="bg-[#111116] border border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 shrink-0">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight">
                  Assigned Medical Waste Disposals
                </h2>
                <p className="text-xs text-zinc-400">
                  Official pickups assigned to you with live QR verification
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setScanModalReq({
                  id: "",
                  request_code: "Disposal Handover",
                  facility_name: "Hospital Facility",
                  facility_code: "HEALTH",
                  weight_kg: "0",
                  container_count: 1,
                  qr_code: "",
                } as any);
                setScannedInput("");
              }}
              className="min-h-[40px] px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-2 shadow-md transition-colors cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              Scan QR Code
            </button>
          </div>

          <div className="p-6 text-center border border-dashed border-white/[0.08] rounded-xl space-y-2">
            <p className="text-sm font-semibold text-zinc-300">
              No waste disposal pickups currently assigned to you
            </p>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Once the Super Administrator assigns an approved medical waste disposal request to your driver profile, full facility address, contact details, medicine lines, and route details will appear here.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setScanModalReq({
                    id: "",
                    request_code: "Disposal Handover",
                    facility_name: "Hospital Facility",
                    facility_code: "HEALTH",
                    weight_kg: "0",
                    container_count: 1,
                    qr_code: "",
                  } as any);
                  setScannedInput("");
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#161622] hover:bg-white/[0.08] text-amber-400 border border-amber-500/30 transition-colors cursor-pointer"
              >
                <Scan className="w-3.5 h-3.5" />
                Open QR Scanner
              </button>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {renderScanModal()}

      {/* Main Container */}
      <section className="bg-[#111116] border border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">
                Assigned Medical Waste Disposals
              </h2>
              <p className="text-xs text-zinc-400">
                Official pickups assigned to you by Super Administrator with live QR verification
              </p>
            </div>
          </div>
          {pendingPickups.length > 0 && (
            <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/35 px-2.5 py-0.5 rounded-full">
              {pendingPickups.length} To Collect
            </span>
          )}
        </div>

        <div className="space-y-3.5">
          {requests.map((req) => {
            const isExpanded = expandedId === req.id;
            const isReadyToCollect = req.status === "APPROVED";

            return (
              <div
                key={req.id}
                className={`border rounded-xl p-4 space-y-3.5 transition-colors ${
                  isReadyToCollect
                    ? "bg-[#161622] border-amber-500/35 shadow-md"
                    : "bg-[#161622]/60 border-white/[0.06]"
                }`}
              >
                {/* Header row: Request Code, Status, Schedule */}
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.04] pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-base">
                        {req.request_code}
                      </span>
                      <StatusBadge status={req.status as any} size="sm" />
                      {req.contains_expired && (
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-semibold">
                          Contains Expired Medicine
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-semibold text-zinc-300 block">
                      Scheduled: {req.scheduled_date ?? "Immediate pickup"}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Requested {req.created_at}
                    </span>
                  </div>
                </div>

                {/* Origin Hospital & Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {/* Originating Facility */}
                  <div className="bg-[#111116] p-2.5 rounded-xl border border-white/[0.04] space-y-1">
                    <div className="flex items-center gap-1.5 text-zinc-200 font-semibold">
                      <Hospital className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{req.facility_name} ({req.facility_code})</span>
                    </div>
                    <div className="flex items-start gap-1.5 text-zinc-400 text-[11px]">
                      <MapPin className="w-3 h-3 text-zinc-500 shrink-0 mt-0.5" />
                      <span>
                        {req.facility_address}
                        {req.facility_city ? `, ${req.facility_city}` : ""}
                        {req.facility_region ? ` (${req.facility_region})` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 pt-0.5 text-[11px] text-zinc-400">
                      <span>Requester: <strong className="text-zinc-300">{req.requested_by_name}</strong></span>
                      {req.requester_phone && (
                        <a href={`tel:${req.requester_phone}`} className="text-amber-400 hover:underline flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {req.requester_phone}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Destination Facility & Assigned Vehicle */}
                  <div className="bg-[#111116] p-2.5 rounded-xl border border-white/[0.04] space-y-1">
                    <div className="flex items-center gap-1.5 text-zinc-200 font-semibold">
                      <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>Destination: {req.destination_name ?? "Central Disposal Facility"}</span>
                    </div>
                    {req.destination_address && (
                      <p className="text-[11px] text-zinc-400">
                        {req.destination_address}{req.destination_city ? `, ${req.destination_city}` : ""}
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-0.5 text-[11px]">
                      <Car className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-zinc-300 font-mono font-semibold">
                        Vehicle: {req.vehicle_plate_no ?? "Assigned Fleet Truck"}
                      </span>
                      {req.vehicle_model && (
                        <span className="text-zinc-500">({req.vehicle_model})</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Key Metrics: Category, Volume, Containers */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-[#111116] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-zinc-500 text-[10px] block uppercase font-medium">Category</span>
                    <span className="font-semibold text-zinc-200 truncate block">
                      {req.category_name}
                    </span>
                  </div>
                  <div className="bg-[#111116] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-zinc-500 text-[10px] block uppercase font-medium">Total Weight</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {req.weight_kg} kg
                    </span>
                  </div>
                  <div className="bg-[#111116] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-zinc-500 text-[10px] block uppercase font-medium">Containers</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {req.container_count} count
                    </span>
                  </div>
                </div>

                {/* Expandable Full Medicine Details & Approval Trail */}
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    className="flex items-center justify-between w-full text-xs text-amber-400 hover:text-amber-300 py-1 font-medium transition-colors"
                  >
                    <span>
                      {isExpanded
                        ? "Hide medicine items & approval trail"
                        : `View ${req.lines?.length ?? 0} medicine items & approval trail`}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 space-y-3 bg-[#111116] p-3 rounded-xl border border-white/[0.05]">
                      {/* Medicine Items List */}
                      <div>
                        <h4 className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-amber-400" />
                          Medicine Items to Collect ({req.lines?.length ?? 0}):
                        </h4>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {req.lines?.map((line, idx) => (
                            <div
                              key={`${line.item}-${line.batch}-${idx}`}
                              className="flex flex-wrap items-center justify-between text-xs p-2 bg-[#161622] rounded-lg border border-white/[0.03]"
                            >
                              <div className="space-x-1.5">
                                <strong className="text-zinc-100">{line.item}</strong>
                                {line.strength && <span className="text-zinc-400">({line.strength})</span>}
                                {line.form && <span className="text-zinc-500">[{line.form}]</span>}
                                <span className="text-zinc-400 font-mono text-[11px]">
                                  Batch: <span className="text-amber-300">{line.batch}</span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-zinc-200">
                                  {line.quantity} {line.unit}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                  line.is_expired
                                    ? "bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}>
                                  Exp: {line.expiry_date}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Approval History Trail */}
                      <div className="pt-2 border-t border-white/[0.04]">
                        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          Verified Approval History:
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-zinc-300">
                          <div className="bg-[#161622] p-2 rounded-lg">
                            <span className="text-zinc-500 block text-[10px]">1. Hospital Admin</span>
                            <span className="font-semibold text-emerald-400">Approved</span>
                            <span className="text-zinc-400 block text-[10px]">
                              {req.hospital_decided_by_name ?? "Hospital Admin"} ({req.decided_at ?? "Yes"})
                            </span>
                          </div>
                          <div className="bg-[#161622] p-2 rounded-lg">
                            <span className="text-zinc-500 block text-[10px]">2. EFDA Regulatory</span>
                            {req.contains_expired ? (
                              <>
                                <span className="font-semibold text-emerald-400">EFDA Approved</span>
                                <span className="text-zinc-400 block text-[10px]">
                                  {req.efda_decided_by_name ?? "EFDA Officer"} ({req.efda_decided_at ?? "Yes"})
                                </span>
                              </>
                            ) : (
                              <span className="text-zinc-400 italic">Not required (ordinary)</span>
                            )}
                          </div>
                          <div className="bg-[#161622] p-2 rounded-lg">
                            <span className="text-zinc-500 block text-[10px]">3. Super Admin Assignment</span>
                            <span className="font-semibold text-emerald-400">Driver Assigned</span>
                            <span className="text-zinc-400 block text-[10px]">
                              {req.assigned_by_name ?? "Super Admin"} ({req.assigned_at ?? "Yes"})
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {req.note && (
                  <p className="text-xs text-zinc-300 italic bg-[#111116] p-2.5 rounded-lg border border-white/[0.04]">
                    <strong>Staff Handling Note:</strong> {req.note}
                  </p>
                )}

                {/* Prominent Action Bar: "Scan QR" button */}
                <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                  {isReadyToCollect ? (
                    <button
                      type="button"
                      onClick={() => openScanModal(req)}
                      className="min-h-[44px] px-6 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      Scan QR & Receive Waste
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/20">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        Received by Driver {req.driver_scanned_at ? `(${req.driver_scanned_at})` : ""}
                      </span>
                    </div>
                  )}

                  <span className="text-[11px] text-zinc-500">
                    Hospital Staff Requester: {req.requested_by_name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
