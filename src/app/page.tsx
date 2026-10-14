import { redirect } from "next/navigation";
import { getCurrentUser, isDevBypassRequest } from "@/server/auth/current-user";
import { HOME_BY_ROLE, hasAccess } from "@/server/auth/access-rules";
import { HomePage } from "@/components/home/home-page";

/**
 * `/`: signed-in users go to the area of their role (CLAUDE.md §3), decided on the server from the `users` table;
 * no users row, no role or inactive → /pending. Visitors who are not signed in see the public home page, whose
 * "Sign in" goes to /sign-in (or /dev-login with the development bypass).
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (hasAccess(user)) redirect(HOME_BY_ROLE[user.role]);
  if (user) redirect("/pending");
  return <HomePage signInHref={(await isDevBypassRequest()) ? "/dev-login" : "/sign-in"} />;
}
