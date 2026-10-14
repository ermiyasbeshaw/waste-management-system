import { Clock } from "lucide-react";
import { getCurrentUser, isDevBypassRequest } from "@/server/auth/current-user";
import { DevAccountMenu } from "@/components/dev/dev-account-menu";
import Link from "next/link";
import { AccountMenu } from "@/server/auth/clerk-ui";

/** /pending — signed in, but no users row, no role, or deactivated (CLAUDE.md §3). */
export default async function PendingPage() {
  const user = await getCurrentUser();
  const devBypass = await isDevBypassRequest();

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4">
      <div className="bg-[#111116] border border-amber-500/20 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <Clock className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-white">Account Pending Role Assignment</h1>

        {devBypass || process.env.NODE_ENV === "development" ? (
          <p className="text-sm text-zinc-400 leading-relaxed">
            Development mode: this test login has no access.{" "}
            <Link href="/dev-login" className="text-emerald-400 underline">
              Sign in with a dashboard test login
            </Link>{" "}
            (usernames and passwords are in docs/test-users.md).
          </p>
        ) : (
          <p className="text-sm text-zinc-400 leading-relaxed">
            Hello <span className="text-zinc-200 font-semibold">{user?.fullName ?? "there"}</span>,
            you are signed in, but your account has no access yet. A SafeWaste administrator must
            assign your role{user?.active === false ? " and re-activate your account" : ""} before
            you can use the dashboards.
          </p>
        )}

        <div className="pt-4 border-t border-white/[0.06] flex items-center justify-center gap-3">
          <DevAccountMenu />
          <AccountMenu />
        </div>
      </div>
    </div>
  );
}
