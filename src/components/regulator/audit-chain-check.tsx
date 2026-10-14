"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { checkAuditChainAction } from "@/app/(desk)/regulator/audit/actions";

/** "Verify the hash chain" (Gate 6.5): recomputes every audit entry's hash and shows the result. */
export function AuditChainCheck() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 flex flex-wrap items-center gap-4">
      <div className="flex-1 min-w-[220px]">
        <h3 className="text-sm font-semibold text-white">Audit hash chain</h3>
        <p className="text-xs text-zinc-400">
          Every entry carries the hash of the one before. Checking recomputes them all; any change
          to a past entry breaks the chain at that point.
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await checkAuditChainAction();
            if (!r.ok) return setResult({ ok: false, text: r.message });
            setResult(
              r.data.ok
                ? { ok: true, text: `Chain intact: ${r.data.checked} entries checked.` }
                : {
                    ok: false,
                    text: `Chain BROKEN at entry #${r.data.brokenSeq} (${r.data.reason.replace(/_/g, " ")}) after ${r.data.checked} entries.`,
                  }
            );
          })
        }
        className="min-h-[44px] px-4 rounded-xl bg-emerald-500 text-black text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "Checking…" : "Verify the hash chain"}
      </button>
      {result && (
        <p
          role="status"
          className={`w-full flex items-center gap-2 text-sm font-medium ${result.ok ? "text-emerald-300" : "text-rose-300"}`}
        >
          {result.ok ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          {result.text}
        </p>
      )}
    </div>
  );
}
