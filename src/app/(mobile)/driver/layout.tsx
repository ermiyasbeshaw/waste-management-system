import { requireAreaAccess } from "@/server/auth/area-guard";
import { getDriverDashboard } from "@/server/queries/driver";
import { DriverShell } from "@/components/driver/driver-shell";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  // Area guard (CLAUDE.md §3): no access → sign-in / pending; another role → its own area.
  await requireAreaAccess("driver");
  const data = await getDriverDashboard();
  return <DriverShell data={data}>{children}</DriverShell>;
}
