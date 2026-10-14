import { requireAreaAccess } from "@/server/auth/area-guard";
import { getDisposalDashboard } from "@/server/queries/disposal";
import { DisposalHeader } from "@/components/disposal/disposal-header";
import { DisposalNav } from "@/components/disposal/disposal-nav";

export default async function DisposalLayout({ children }: { children: React.ReactNode }) {
  // Area guard (CLAUDE.md §3): no access → /pending; another role → its own area.
  await requireAreaAccess("disposal");
  const data = await getDisposalDashboard();

  return (
    <div className="space-y-4">
      <DisposalHeader data={data} />
      {children}
      <DisposalNav
        counts={{
          queue: data.queue.length,
          inbound: data.inbound.length,
          exceptions: data.exceptions.length,
        }}
      />
    </div>
  );
}
