import { requireAreaAccess } from "@/server/auth/area-guard";
import { getHospitalFacility } from "@/server/queries/hospital";
import { HospitalShell } from "@/components/hospital/hospital-shell";

export default async function HospitalLayout({ children }: { children: React.ReactNode }) {
  // Area guard (CLAUDE.md §3): no access → sign-in / pending; another role → its own area.
  const user = await requireAreaAccess("hospital");
  const facility = await getHospitalFacility();
  // Invoices: hospital_admin only (CLAUDE.md §3).
  return (
    <HospitalShell facility={facility} canSeeInvoices={user.role === "hospital_admin"}>
      {children}
    </HospitalShell>
  );
}
