import { requireAreaAccess } from "@/server/auth/area-guard";
import { getHospitalUsers } from "@/server/queries/hospital";
import { getPendingOnboardingRequestsForHospital } from "@/server/queries/onboarding";
import { ErrorState } from "@/components/shared/error-state";
import { HospitalUsersList } from "@/components/admin/people-tables";
import { HospitalStaffRequestsTable } from "@/components/admin/onboarding-management";

/** /hospital/users — hospital_admin manages facility users and approves staff requests (own facility). */
export default async function HospitalUsersPage() {
  const user = await requireAreaAccess("hospital");
  if (user.role !== "hospital_admin") {
    return (
      <ErrorState
        title="Users are managed by the Hospital Administrator"
        description="Your role cannot change who receives pickup codes or approve staff."
      />
    );
  }

  const [rows, staffRequests] = await Promise.all([
    getHospitalUsers(),
    getPendingOnboardingRequestsForHospital(),
  ]);

  return (
    <div className="space-y-6">
      <HospitalStaffRequestsTable requests={staffRequests} />
      <HospitalUsersList rows={rows} selfId={user.id} />
    </div>
  );
}
