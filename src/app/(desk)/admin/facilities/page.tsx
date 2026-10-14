import Link from "next/link";
import { getAdminFacilities } from "@/server/queries/admin";
import { FacilitiesTable } from "@/components/admin/people-tables";
import { primaryButtonClass } from "@/components/shared/form-field";

/** /admin/facilities — facilities with pickup readiness and contract state (super_admin). */
export default async function AdminFacilitiesPage() {
  const rows = await getAdminFacilities();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/admin/facilities/new"
          className={`${primaryButtonClass} inline-flex items-center`}
        >
          New facility
        </Link>
      </div>
      <FacilitiesTable rows={rows} />
    </div>
  );
}
