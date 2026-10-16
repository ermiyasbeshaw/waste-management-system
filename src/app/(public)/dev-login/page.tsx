import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { getDevSession, isDevBypassRequest } from "@/server/auth/current-user";
import { HOME_BY_ROLE } from "@/server/auth/access-rules";
import { DevLoginForm } from "@/components/dev/dev-login-form";
import { AccountMenu } from "@/server/auth/clerk-ui";

import { env } from "@/env";

/**
 * /dev-login — development role workstation login (one username + password per role).
 * Requires Clerk authentication FIRST: unauthenticated visitors are redirected to /sign-in.
 */
export default async function DevLoginPage() {
  if (!env.DEV_LOGIN_SECRET) {
    redirect("/sign-in");
  }

  // 1. CLERK AUTH FIRST: User must be signed in to Clerk (unless in automated test mode):
  const bypass = await isDevBypassRequest();
  const { userId } = await auth();
  if (!bypass && !userId) {
    redirect("/sign-in?redirect_url=/dev-login");
  }

  // 2. If a role session is already active, go directly to that role's home:
  const session = await getDevSession();
  if (session) redirect(HOME_BY_ROLE[session.role]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 py-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-glow">
          <FlaskConical className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">SafeWaste Role Selection</h1>
        <p className="text-sm text-zinc-400 max-w-sm">
          Authenticated with Clerk. Select a role persona to open its workstation (credentials in
          <span className="font-mono text-zinc-300"> docs/test-users.md</span>).
        </p>
      </div>
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#111116] border border-white/[0.08] text-xs text-zinc-400 shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-300 font-medium">Clerk session active</span>
          </div>
          <AccountMenu />
        </div>
        <div className="bg-[#111116] border border-white/[0.08] rounded-2xl p-6 shadow-2xl">
          <DevLoginForm />
        </div>
      </div>
    </div>
  );
}
