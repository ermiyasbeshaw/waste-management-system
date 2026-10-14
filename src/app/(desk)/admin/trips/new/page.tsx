import { getAdminTripPlanningOptions, getAdminWaitingList } from "@/server/queries/admin";
import { TripPlanner } from "@/components/admin/trip-planner";

/** /admin/trips/new — plan a trip from the waiting list (super_admin). */
export default async function PlanTripPage() {
  const [waiting, options] = await Promise.all([
    getAdminWaitingList(),
    getAdminTripPlanningOptions(),
  ]);
  return <TripPlanner waiting={waiting} options={options} />;
}
