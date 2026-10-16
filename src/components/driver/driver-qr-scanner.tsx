"use client";

import { useState, useTransition } from "react";
import { QrCode, Search, CheckCircle2, AlertTriangle, Truck, Package, Calendar, Hospital, ArrowRight, MapPin, Phone, Car, Building2, ShieldCheck, Clock } from "lucide-react";
import { getRequestVerificationAction, scanRequestByDriverAction } from "@/app/(desk)/hospital/stock/actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { CameraQrScanner } from "@/components/shared/camera-qr-scanner";
import type { DisposalRequestRow } from "@/types/view-models";

type VerifiedDetails = {
  id: string;
  requestCode: string;
  qrCode: string;
  facility: {
    id: string;
    code: string;
    name: string;
    address?: string;
    city?: string | null;
    subCity?: string | null;
  };
  requester?: {
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  vehicle?: {
    plateNo: string;
    model?: string | null;
  } | null;
  destination?: {
    name: string;
    code?: string;
    address?: string | null;
    city?: string | null;
  } | null;
  approvalHistory?: {
    hospitalApprovedBy?: string | null;
    hospitalApprovedAt?: string | null;
    containsExpired?: boolean;
    efdaApprovedBy?: string | null;
    efdaApprovedAt?: string | null;
    assignedBy?: string | null;
    assignedAt?: string | null;
  };
  status: string;
  requestedBy: string;
  createdAt: string;
  containerCount: number;
  weightKg: number;
  scheduledDate: string | null;
  note: string | null;
  driverName: string | null;
  driverScannedAt: string | null;
  operatorName: string | null;
  operatorScannedAt: string | null;
  disposedAt: string | null;
  certificateNo: string | null;
  lines: {
    item: string;
    strength: string;
    form: string;
    batch: string;
    quantity: number;
    unit: string;
    expiry_date: string;
    is_expired?: boolean;
  }[];
};

export function DriverQrScanner() {
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState<VerifiedDetails | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isLookingUp, startLookup] = useTransition();
  const [isScanning, startScan] = useTransition();

  const handleLookup = (inputCode?: string) => {
    const target = (inputCode ?? code).trim();
    if (!target) return;
    setLookupError(null);
    setScanMessage(null);
    startLookup(async () => {
      const res = await getRequestVerificationAction(target);
      if (res.ok) {
        setVerified(res.data as unknown as VerifiedDetails);
      } else {
        setVerified(null);
        setLookupError(res.message);
      }
    });
  };

  const handleConfirmCollection = () => {
    if (!verified) return;
    setScanMessage(null);
    startScan(async () => {
      const res = await scanRequestByDriverAction(verified.qrCode || verified.id);
      if (res.ok) {
        setScanMessage({ ok: true, text: res.data.message });
        // Refresh verified record
        handleLookup(verified.qrCode || verified.id);
      } else {
        setScanMessage({ ok: false, text: res.message });
      }
    });
  };

  return (
    <section className="bg-[#111116] border border-amber-500/25 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
          <QrCode className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white leading-tight">
            Medical Waste QR Scanner
          </h2>
          <p className="text-xs text-zinc-400">
            Scan or enter the hospital&apos;s unique QR code to verify and collect waste
          </p>
        </div>
      </div>

      {/* Camera QR Scanner */}
      <CameraQrScanner
        onScan={(scanned) => {
          setCode(scanned);
          handleLookup(scanned);
        }}
        buttonLabel="Scan QR Code with Camera"
      />

      {/* Input / Scanner Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleLookup();
        }}
        className="flex flex-wrap sm:flex-nowrap gap-2"
      >
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Scan QR code or enter code (e.g. QR-MD-... or MD-...)"
            className="w-full min-h-[44px] bg-[#161622] border border-white/[0.12] rounded-xl px-3.5 text-sm font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400/60"
          />
        </div>
        <button
          type="submit"
          disabled={isLookingUp || !code.trim()}
          className="min-h-[44px] px-5 rounded-xl text-xs font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 shrink-0"
        >
          <Search className="w-4 h-4" />
          {isLookingUp ? "Verifying..." : "Verify Waste"}
        </button>
      </form>

      {lookupError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{lookupError}</span>
        </div>
      )}

      {scanMessage && (
        <div
          className={`flex items-start gap-2 p-3 rounded-xl text-xs border ${
            scanMessage.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{scanMessage.text}</p>
            {scanMessage.ok && (
              <p className="text-zinc-400 text-[11px] mt-0.5">
                Super Admin, Regulator (EFDA), and Hospital Administrator dashboards have been updated.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Verified Request Card */}
      {verified && (
        <div className="bg-[#161622] border border-white/[0.08] rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-white">{verified.requestCode}</span>
                <StatusBadge status={verified.status as any} size="sm" />
              </div>
              <p className="text-xs text-zinc-200 flex items-center gap-1.5 mt-1 font-semibold">
                <Hospital className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                {verified.facility.name} ({verified.facility.code})
              </p>
              {verified.facility.address && (
                <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                  {verified.facility.address}{verified.facility.city ? `, ${verified.facility.city}` : ""}
                </p>
              )}
              {verified.requester?.phone && (
                <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3 text-zinc-500 shrink-0" />
                  Contact: <a href={`tel:${verified.requester.phone}`} className="text-amber-400 hover:underline">{verified.requester.phone}</a>
                </p>
              )}
            </div>
            <div className="text-right">
              <span className="text-[11px] text-zinc-400">
                Requested by: {verified.requestedBy}
              </span>
              {verified.vehicle && (
                <span className="text-[11px] font-mono text-emerald-400 font-bold block mt-0.5">
                  Vehicle: {verified.vehicle.plateNo}
                </span>
              )}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-[#111116] p-2.5 rounded-xl border border-white/[0.04]">
              <span className="text-zinc-400 block text-[11px]">Containers</span>
              <span className="font-mono font-bold text-white text-sm">{verified.containerCount}</span>
            </div>
            <div className="bg-[#111116] p-2.5 rounded-xl border border-white/[0.04]">
              <span className="text-zinc-400 block text-[11px]">Weight</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {verified.weightKg} kg
              </span>
            </div>
            <div className="bg-[#111116] p-2.5 rounded-xl border border-white/[0.04]">
              <span className="text-zinc-400 block text-[11px]">Schedule</span>
              <span className="font-mono font-bold text-zinc-200 text-xs">
                {verified.scheduledDate ?? "Today"}
              </span>
            </div>
          </div>

          {/* Items Checklist for Verification */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-amber-400" />
              Verify Medical Waste Items to Collect ({verified.lines.length} lines):
            </h4>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {verified.lines.map((item, idx) => (
                <div
                  key={`${item.item}-${item.batch}-${idx}`}
                  className="flex items-center justify-between text-xs bg-[#111116] p-2 rounded-lg border border-white/[0.04]"
                >
                  <span className="text-zinc-200">
                    {item.item} {item.strength ? `(${item.strength})` : ""} · Batch:{" "}
                    <span className="font-mono text-amber-300">{item.batch}</span>
                  </span>
                  <span className="font-mono text-zinc-300 font-semibold">
                    {item.quantity} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {verified.note && (
            <p className="text-xs text-zinc-400 bg-[#111116] p-2 rounded-lg border border-white/[0.04]">
              <strong className="text-zinc-300">Staff Note:</strong> {verified.note}
            </p>
          )}

          {/* Dual Scan & Handover Verification Trail */}
          <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
            <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              Scan Verification & Handover Trail:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* Driver Scan State */}
              <div className={`p-2.5 rounded-xl border ${
                verified.driverScannedAt
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-[#111116] border-white/[0.06] text-zinc-400"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    {verified.driverScannedAt ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Clock className="w-3.5 h-3.5 text-zinc-500" />}
                    Driver QR Scan
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    verified.driverScannedAt ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-400"
                  }`}>
                    {verified.driverScannedAt ? "SCANNED" : "NOT SCANNED"}
                  </span>
                </div>
                <p className="text-[11px] mt-1 text-zinc-400">
                  {verified.driverScannedAt
                    ? `Scanned by ${verified.driverName ?? "Driver"} on ${verified.driverScannedAt.slice(0, 16).replace("T", " ")}`
                    : "Awaiting driver collection & hospital handover"}
                </p>
              </div>

              {/* Operator Scan State */}
              <div className={`p-2.5 rounded-xl border ${
                verified.operatorScannedAt
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-[#111116] border-white/[0.06] text-zinc-400"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    {verified.operatorScannedAt ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Clock className="w-3.5 h-3.5 text-zinc-500" />}
                    Operator Facility Scan
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    verified.operatorScannedAt ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-400"
                  }`}>
                    {verified.operatorScannedAt ? "SCANNED" : "NOT SCANNED"}
                  </span>
                </div>
                <p className="text-[11px] mt-1 text-zinc-400">
                  {verified.operatorScannedAt
                    ? `Scanned by ${verified.operatorName ?? "Operator"} on ${verified.operatorScannedAt.slice(0, 16).replace("T", " ")}`
                    : "Awaiting arrival & terminal check-in"}
                </p>
              </div>
            </div>
          </div>

          {/* Action according to current state */}
          <div className="pt-2 border-t border-white/[0.06]">
            {verified.status === "APPROVED" ? (
              <button
                type="button"
                disabled={isScanning}
                onClick={handleConfirmCollection}
                className="w-full min-h-[46px] rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
              >
                <Truck className="w-4 h-4" />
                {isScanning ? "Scanning & Recording Collection..." : "Scan QR & Confirm Waste Received by Driver"}
              </button>
            ) : verified.status === "RECEIVED_BY_DRIVER" ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
                <span className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  Waste Received by Driver
                </span>
                <span className="text-[11px] text-zinc-400">
                  {verified.driverScannedAt?.slice(0, 16).replace("T", " ")}
                </span>
              </div>
            ) : verified.status === "RECEIVED_AT_FACILITY" || verified.status === "DISPOSED" ? (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs">
                Status: {verified.status} — Arrived at Disposal Facility
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  This request is {verified.status}. Only requests in <strong>APPROVED</strong> status can be collected.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
