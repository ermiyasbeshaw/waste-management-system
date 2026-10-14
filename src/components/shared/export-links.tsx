import { Download } from "lucide-react";

/**
 * Export buttons (Gate 6.4): the server checks the role and the facility scope and audits every export, so the
 * links are the same for everyone allowed to see the page.
 */
export function ExportLinks({
  report,
  label,
}: {
  report: "waste" | "certificates" | "invoices" | "audit" | "stock" | "medicine-requests";
  label: string;
}) {
  const cls =
    "inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08]";
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" aria-label={`Export ${label}`}>
      <span className="text-xs text-zinc-500">Export {label}:</span>
      <a href={`/api/export/${report}?format=xlsx`} className={cls}>
        <Download className="w-3.5 h-3.5" aria-hidden="true" /> Excel
      </a>
      <a href={`/api/export/${report}?format=pdf`} className={cls}>
        <Download className="w-3.5 h-3.5" aria-hidden="true" /> PDF
      </a>
    </div>
  );
}
