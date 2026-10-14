import { Shield, Lock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

export function RegulatorHeader() {
  return (
    <PageHeader
      title="EFDA Regulatory & Compliance Oversight"
      subtitle="Ethiopian Food & Drug Authority (EFDA) Hazardous Biohazard Logistics Inspection, Cryptographic Verification & Immutable Ledger."
      icon={Shield}
      badgeText="COMPLIANCE SCOPE: READ-ONLY"
      badgeColor="purple"
    >
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/80 border border-white/[0.08] text-[11px] text-zinc-400 font-mono">
        <Lock className="w-3.5 h-3.5 text-emerald-400" />
        <span>MUTATIONS DISABLED</span>
      </div>
    </PageHeader>
  );
}
