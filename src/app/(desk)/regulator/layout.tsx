import { requireAreaAccess } from "@/server/auth/area-guard";
import { RegulatorHeader } from "@/components/regulator/regulator-header";

export default async function RegulatorLayout({ children }: { children: React.ReactNode }) {
  // Area guard (CLAUDE.md §3): no access → sign-in / pending; another role → its own area.
  await requireAreaAccess("regulator");

  return (
    <div className="space-y-6">
      <RegulatorHeader />
      {/* Each page renders <RegulatorScope> (filters, KPIs, tabs) so it follows the URL filters. */}
      {children}
    </div>
  );
}
