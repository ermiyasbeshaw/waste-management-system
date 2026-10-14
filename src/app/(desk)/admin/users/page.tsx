import { getAdminUsers } from "@/server/queries/admin";
import { UsersTable } from "@/components/admin/people-tables";

/** /admin/users — every user's role, facility and access (super_admin). Invitations come with Clerk (last). */
export default async function AdminUsersPage() {
  const rows = await getAdminUsers();
  return <UsersTable rows={rows} />;
}
