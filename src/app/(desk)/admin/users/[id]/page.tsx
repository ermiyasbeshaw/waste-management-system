import { notFound } from "next/navigation";
import { requireAreaAccess } from "@/server/auth/area-guard";
import { getAdminFacilities, getAdminUser } from "@/server/queries/admin";
import { UserAccessForm } from "@/components/admin/people-tables";

/** /admin/users/[id] — change one user's role, facility, access and pickup-code flag (super_admin). */
export default async function AdminUserPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await requireAreaAccess("admin");
  const [user, facilities] = await Promise.all([getAdminUser(params.id), getAdminFacilities()]);
  if (!user) notFound();
  return (
    <UserAccessForm
      user={user}
      facilities={facilities.map((f) => ({ id: f.id, code: f.code, name: f.name }))}
      isSelf={user.id === me.id}
    />
  );
}
