import Link from "next/link";
import { getAdminTrips } from "@/server/queries/admin";
import { TripsList } from "@/components/admin/trip-admin";
import { primaryButtonClass } from "@/components/shared/form-field";

/** /admin/trips — open and recent trips (super_admin). */
export default async function AdminTripsPage() {
  const rows = await getAdminTrips();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/admin/trips/new" className={`${primaryButtonClass} inline-flex items-center`}>
          Plan a trip
        </Link>
      </div>
      <TripsList rows={rows} />
    </div>
  );
}
