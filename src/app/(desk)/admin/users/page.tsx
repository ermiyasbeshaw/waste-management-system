import { getAdminFacilities, getAdminUsers } from "@/server/queries/admin";
import { getPendingOnboardingRequestsForAdmin } from "@/server/queries/onboarding";
import { UsersTable } from "@/components/admin/people-tables";
import { AdminOnboardingTable } from "@/components/admin/onboarding-management";

/** /admin/users — manage users, dual-path onboarding, and role approvals (super_admin). */
export default async function AdminUsersPage() {
  const [rows, requests, facilities] = await Promise.all([
    getAdminUsers(),
    getPendingOnboardingRequestsForAdmin(),
    getAdminFacilities(),
  ]);

  return (
    <div className="space-y-8">
      <AdminOnboardingTable
        requests={requests}
        facilities={facilities.map((f) => ({ id: f.id, code: f.code, name: f.name }))}
      />
      <UsersTable rows={rows} />
    </div>
  );
}
