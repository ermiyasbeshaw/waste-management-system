import { getDisposalDashboard, getDisposalWork } from "@/server/queries/disposal";
import { QueueList } from "@/components/disposal/container-lists";
import { DestructionDesk } from "@/components/disposal/destruction-desk";
import { DisposalQrScanner } from "@/components/disposal/disposal-qr-scanner";

/** /disposal — waste ready for destruction, then the container queue. */
export default async function DisposalQueuePage() {
  const [data, work] = await Promise.all([getDisposalDashboard(), getDisposalWork()]);
  return (
    <div className="space-y-4">
      <DisposalQrScanner />
      <DestructionDesk ready={work.ready} methods={work.methods} />
      <QueueList rows={data.queue} />
    </div>
  );
}
