import { requireAreaAccess } from "@/server/auth/area-guard";
import { getHospitalUsers } from "@/server/queries/hospital";
import { ErrorState } from "@/components/shared/error-state";
import { HospitalUsersList } from "@/components/admin/people-tables";

/** /hospital/users — hospital_admin manages who is active and who receives pickup codes (own facility). */
export default async function HospitalUsersPage() {
  const user = await requireAreaAccess("hospital");
  if (user.role !== "hospital_admin") {
    return (
      <ErrorState
        title="Users are managed by the Hospital Administrator"
        description="Your role cannot change who receives pickup codes."
      />
    );
  }
  return <HospitalUsersList rows={await getHospitalUsers()} selfId={user.id} />;
}
