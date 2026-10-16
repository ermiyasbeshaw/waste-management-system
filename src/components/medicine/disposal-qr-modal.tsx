"use client";

import { useEffect, useState } from "react";
import { QrCode, Printer, X, CheckCircle2, Clock, Truck, Building2 } from "lucide-react";
import { getQrCodeDataUrlAction } from "@/app/(desk)/hospital/stock/actions";
import { StatusBadge } from "@/components/shared/status-badge";
import type { DisposalRequestRow } from "@/types/view-models";

export function DisposalQrModal({
  row,
  open,
  onClose,
}: {
  row: DisposalRequestRow;
  open: boolean;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const targetCode = row.qrCode || `QR-${row.requestCode}`;
    getQrCodeDataUrlAction(targetCode)
      .then((res) => {
        if (active && res.ok) setDataUrl(res.data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, row.qrCode]);

  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Disposal Request QR Pass ${row.requestCode}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md bg-[#111116] border border-white/[0.12] rounded-3xl p-6 shadow-2xl space-y-5 print:border-none print:shadow-none print:p-0 print:bg-white print:text-black">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-3 print:border-black/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-white print:text-black">
                {row.requestCode}
              </span>
              <StatusBadge status={row.status} size="sm" />
            </div>
            <p className="text-xs text-zinc-400 print:text-zinc-600 mt-0.5">
              {row.facility.name} ({row.facility.code})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors print:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-inner border border-zinc-200">
          {loading ? (
            <div className="w-56 h-56 flex items-center justify-center text-zinc-400 text-sm">
              Generating unique QR pass...
            </div>
          ) : dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt={`QR Code for ${row.requestCode}`}
              className="w-56 h-56 object-contain"
            />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-rose-500 text-sm font-mono">
              Failed to load QR code
            </div>
          )}
          <span className="mt-2 text-[11px] font-mono font-semibold tracking-wider text-zinc-700 select-all">
            {row.qrCode}
          </span>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-[#161622] print:bg-zinc-100 p-3 rounded-xl border border-white/[0.06] print:border-zinc-300">
          <div>
            <span className="text-zinc-400 print:text-zinc-600 block">Containers</span>
            <span className="font-semibold text-white print:text-black">{row.containerCount}</span>
          </div>
          <div>
            <span className="text-zinc-400 print:text-zinc-600 block">Weight</span>
            <span className="font-semibold text-white print:text-black">{row.weightKg} kg</span>
          </div>
          <div>
            <span className="text-zinc-400 print:text-zinc-600 block">Scheduled Date</span>
            <span className="font-semibold text-white print:text-black">
              {row.scheduledDate ?? "Standard"}
            </span>
          </div>
          <div>
            <span className="text-zinc-400 print:text-zinc-600 block">Items</span>
            <span className="font-semibold text-white print:text-black">{row.lines.length} lines</span>
          </div>
        </div>

        {/* Tracking Status */}
        <div className="space-y-1.5 text-xs text-zinc-300 print:text-zinc-700 border-t border-white/[0.06] pt-3 print:border-zinc-300">
          <div className="flex items-center gap-2">
            <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Driver status:</span>
            {row.driverScannedAt ? (
              <span className="text-emerald-400 font-medium">
                Received by {row.driverName ?? "driver"} ({row.driverScannedAt.slice(0, 10)})
              </span>
            ) : (
              <span className="text-zinc-400 italic">Not scanned yet by driver</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>Facility status:</span>
            {row.operatorScannedAt ? (
              <span className="text-emerald-400 font-medium">
                Received at disposal facility ({row.operatorScannedAt.slice(0, 10)})
              </span>
            ) : (
              <span className="text-zinc-400 italic">Pending facility receipt</span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print QR Pass
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
