import { notFound } from "next/navigation";
import { getAdminFacility } from "@/server/queries/admin";
import { FacilityForm, FacilityStatusControl } from "@/components/admin/facility-form";

/** /admin/facilities/[code] — edit master data and status (super_admin). */
export default async function EditFacilityPage(props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  const facility = await getAdminFacility(params.code);
  if (!facility) notFound();
  return (
    <div className="space-y-4">
      <FacilityStatusControl facility={facility} />
      <FacilityForm facility={facility} />
    </div>
  );
}
