"use client";

import { useState, useTransition } from "react";
import { cancelWasteAction } from "@/app/(desk)/hospital/waste/actions";

/** "Cancel" for a waste record that is not yet picked up (REGISTERED / SCHEDULED); a reason is required. */
export function CancelWaste({ id, wasteCode }: { id: string; wasteCode: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (message?.ok) return <span className="text-[11px] text-zinc-400">{message.text}</span>;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold bg-rose-500/15 text-rose-300"
        aria-label={`Cancel ${wasteCode}`}
      >
        Cancel
      </button>
    );
  }
  return (
    <div className="space-y-1.5 min-w-[200px]">
      <input
        aria-label={`Reason for cancelling ${wasteCode}`}
        placeholder="Reason (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full min-h-[36px] bg-[#161622] text-xs text-zinc-100 border border-white/[0.1] rounded-lg px-2"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            start(async () => {
              const r = await cancelWasteAction(id, { reason });
              setMessage(r.ok ? { ok: true, text: "Cancelled" } : { ok: false, text: r.message });
            })
          }
          className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold bg-rose-500 text-white disabled:opacity-50"
        >
          Confirm cancel
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-zinc-400">
          Keep
        </button>
      </div>
      {message && !message.ok && (
        <p role="alert" className="text-[11px] text-rose-300">
          {message.text}
        </p>
      )}
    </div>
  );
}
