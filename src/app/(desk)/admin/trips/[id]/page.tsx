import { notFound } from "next/navigation";
import { getAdminTripDetail, getAdminTripPlanningOptions } from "@/server/queries/admin";
import { TripAdmin } from "@/components/admin/trip-admin";
import { RouteReplay } from "@/components/maps/route-replay";

/** /admin/trips/[id] — stops, evidence, admin actions and (once started) the route replay (super_admin). */
export default async function TripDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [trip, options] = await Promise.all([
    getAdminTripDetail(params.id),
    getAdminTripPlanningOptions(),
  ]);
  if (!trip) notFound();
  return (
    <div className="space-y-6">
      <TripAdmin trip={trip} options={options} />
      {trip.startedAt && (
        <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Route replay</h3>
          <RouteReplay initialTripId={trip.id} height="380px" />
        </section>
      )}
    </div>
  );
}
