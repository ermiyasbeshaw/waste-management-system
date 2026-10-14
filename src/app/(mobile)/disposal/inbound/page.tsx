import { getDisposalDashboard, getDisposalWork } from "@/server/queries/disposal";
import { ReceiptDesk } from "@/components/disposal/receipt-desk";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

/** /disposal/inbound — check-in of collected containers, and the trucks on their way to the site. */
export default async function DisposalInboundPage() {
  const [data, work] = await Promise.all([getDisposalDashboard(), getDisposalWork()]);

  return (
    <div className="space-y-4">
      <ReceiptDesk onBoard={work.onBoard} />
      {data.inbound.length === 0 ? (
        <EmptyState title="No inbound trucks" description="No trip is in progress." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.inbound.map((trip) => (
            <div
              key={trip.id}
              className="bg-[#111116] border border-blue-500/20 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono text-blue-400 font-semibold uppercase">
                    INBOUND FLEET UNIT
                  </span>
                  <h4 className="text-lg font-bold text-white font-mono">{trip.vehiclePlate}</h4>
                </div>
                <StatusBadge status={trip.status} size="sm" />
              </div>
              <div className="space-y-2 text-sm text-zinc-300">
                <div className="flex justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-zinc-500">Assigned Driver:</span>
                  <span className="font-semibold">{trip.driverName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-zinc-500">Collected Payload:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {trip.weightKgTotal} kg
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500">Onboard Containers:</span>
                  <span className="font-mono font-bold text-zinc-200">
                    {trip.containersTotal} containers
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
