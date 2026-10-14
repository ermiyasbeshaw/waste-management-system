import { redirect } from "next/navigation";
import { getAuthUserId, getCurrentUser, isDevBypassRequest } from "@/server/auth/current-user";
import { HOME_BY_ROLE, hasAccess } from "@/server/auth/access-rules";

/**
 * `/`: replaces the public marketing page with direct authentication (Clerk first -> role login).
 * - Logged-in role users -> their dashboard (/admin, /hospital, etc.)
 * - Clerk-authenticated users -> /dev-login to select role persona
 * - Unauthenticated visitors -> /sign-in (Clerk authentication first)
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (hasAccess(user)) redirect(HOME_BY_ROLE[user.role]);
  if (user) redirect("/pending");

  const authId = await getAuthUserId();
  if (authId) {
    if (process.env.NODE_ENV === "development") {
      redirect("/dev-login");
    }
    redirect("/pending");
  }

  const devBypass = await isDevBypassRequest();
  if (devBypass) {
    redirect("/dev-login");
  }

  redirect("/sign-in");
}
