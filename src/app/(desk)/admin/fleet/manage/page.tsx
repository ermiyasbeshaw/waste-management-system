import { getAdminFleet } from "@/server/queries/admin";
import { FleetManager } from "@/components/admin/fleet-manager";

/** /admin/fleet/manage — vehicles, drivers, trackers and licences (super_admin). */
export default async function FleetManagePage() {
  return <FleetManager data={await getAdminFleet()} />;
}
