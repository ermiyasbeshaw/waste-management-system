"use client";

import { useState, useTransition } from "react";
import {
  QrCode,
  Search,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Flame,
  FileText,
  Package,
  Hospital,
  Truck,
  ArrowRight,
} from "lucide-react";
import {
  getRequestVerificationAction,
  markDisposalCompleteAction,
  scanRequestByOperatorAction,
} from "@/app/(desk)/hospital/stock/actions";
import { StatusBadge } from "@/components/shared/status-badge";

type VerifiedDetails = {
  id: string;
  requestCode: string;
  qrCode: string;
  facility: { id: string; code: string; name: string };
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
  }[];
};

export function DisposalQrScanner() {
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState<VerifiedDetails | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isLookingUp, startLookup] = useTransition();
  const [isProcessing, startProcessing] = useTransition();

  const handleLookup = (inputCode?: string) => {
    const target = (inputCode ?? code).trim();
    if (!target) return;
    setLookupError(null);
    setActionMessage(null);
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

  const handleReceiveAtFacility = () => {
    if (!verified) return;
    setActionMessage(null);
    startProcessing(async () => {
      const res = await scanRequestByOperatorAction(verified.qrCode || verified.id);
      if (res.ok) {
        setActionMessage({ ok: true, text: res.data.message });
        handleLookup(verified.qrCode || verified.id);
      } else {
        setActionMessage({ ok: false, text: res.message });
      }
    });
  };

  const handleMarkAsDisposed = () => {
    if (!verified) return;
    setActionMessage(null);
    startProcessing(async () => {
      const res = await markDisposalCompleteAction(verified.id);
      if (res.ok) {
        setActionMessage({ ok: true, text: res.data.message });
        handleLookup(verified.id);
      } else {
        setActionMessage({ ok: false, text: res.message });
      }
    });
  };

  return (
    <section className="bg-[#111116] border border-rose-500/25 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
          <QrCode className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white leading-tight">
            Disposal Facility QR Reception & Destruction
          </h2>
          <p className="text-xs text-zinc-400">
            Scan QR code to receive inbound medical waste and issue disposal certificates
          </p>
        </div>
      </div>

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
            placeholder="Scan or enter QR code / Request code (e.g. QR-MD-... or MD-...)"
            className="w-full min-h-[44px] bg-[#161622] border border-white/[0.12] rounded-xl px-3.5 text-sm font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-rose-400/60"
          />
        </div>
        <button
          type="submit"
          disabled={isLookingUp || !code.trim()}
          className="min-h-[44px] px-5 rounded-xl text-xs font-semibold bg-rose-500 text-white hover:bg-rose-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 shrink-0"
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

      {actionMessage && (
        <div
          className={`flex items-start gap-2 p-3 rounded-xl text-xs border ${
            actionMessage.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{actionMessage.text}</p>
            {actionMessage.ok && (
              <p className="text-zinc-400 text-[11px] mt-0.5">
                Dashboards for EFDA Regulator, Hospital Administrator, and Super Administrator updated.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Verified Card */}
      {verified && (
        <div className="bg-[#161622] border border-white/[0.08] rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-white">{verified.requestCode}</span>
                <StatusBadge status={verified.status as any} size="sm" />
              </div>
              <p className="text-xs text-zinc-300 flex items-center gap-1 mt-1">
                <Hospital className="w-3.5 h-3.5 text-zinc-400" />
                {verified.facility.name} ({verified.facility.code})
              </p>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono text-zinc-400 block select-all">
                {verified.qrCode}
              </span>
              {verified.driverName && (
                <span className="text-[11px] text-amber-300 flex items-center justify-end gap-1 mt-0.5">
                  <Truck className="w-3 h-3" /> Driver: {verified.driverName}
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
              <span className="text-zinc-400 block text-[11px]">Status</span>
              <span className="font-mono font-bold text-zinc-200 text-xs">
                {verified.status}
              </span>
            </div>
          </div>

          {/* Verified Items List */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-rose-400" />
              Manifest Medicines to Destroy ({verified.lines.length} lines):
            </h4>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {verified.lines.map((item, idx) => (
                <div
                  key={`${item.item}-${item.batch}-${idx}`}
                  className="flex items-center justify-between text-xs bg-[#111116] p-2 rounded-lg border border-white/[0.04]"
                >
                  <span className="text-zinc-200">
                    {item.item} {item.strength ? `(${item.strength})` : ""} · Batch:{" "}
                    <span className="font-mono text-zinc-300">{item.batch}</span>
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {item.quantity} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Stages */}
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            {verified.status === "RECEIVED_BY_DRIVER" && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleReceiveAtFacility}
                className="w-full min-h-[46px] rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
              >
                <Building2 className="w-4 h-4" />
                {isProcessing
                  ? "Scanning & Recording Reception..."
                  : "Scan QR & Update to Received at Disposal Facility"}
              </button>
            )}

            {verified.status === "RECEIVED_AT_FACILITY" && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleMarkAsDisposed}
                className="w-full min-h-[48px] rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 transition-all disabled:opacity-50"
              >
                <Flame className="w-5 h-5 text-black" />
                {isProcessing
                  ? "Finalizing Disposal & Issuing Certificate..."
                  : "Mark as Disposed & Generate PDF Certificate"}
              </button>
            )}

            {verified.status === "DISPOSED" && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Disposal Completed & Certificate Issued
                  </span>
                  {verified.certificateNo && (
                    <span className="font-mono font-bold text-white bg-emerald-500/30 px-2 py-0.5 rounded">
                      {verified.certificateNo}
                    </span>
                  )}
                </div>
                <div className="pt-1">
                  <a
                    href={`/api/certificates/disposal/${verified.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-4 rounded-xl text-xs font-semibold bg-emerald-500 text-black hover:bg-emerald-400 transition-colors shadow"
                  >
                    <FileText className="w-4 h-4" />
                    Download PDF Certificate
                  </a>
                </div>
              </div>
            )}

            {(verified.status === "PENDING_APPROVAL" || verified.status === "APPROVED") && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  This waste has not been collected and scanned by a driver yet (Current status:{" "}
                  <strong>{verified.status}</strong>).
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
