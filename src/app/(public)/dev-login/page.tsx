import { notFound, redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { getDevSession, isDevBypassRequest } from "@/server/auth/current-user";
import { HOME_BY_ROLE } from "@/server/auth/access-rules";
import { DevLoginForm } from "@/components/dev/dev-login-form";

/**
 * /dev-login — development test login: one username + password per dashboard (docs/test-users.md).
 * Exists only while the development sign-in bypass is active (`next dev` on localhost). In production this
 * page is "not found" and everyone signs in with Clerk at /sign-in.
 */
export default async function DevLoginPage() {
  if (!(await isDevBypassRequest())) notFound();
  const session = await getDevSession();
  if (session) redirect(HOME_BY_ROLE[session.role]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 py-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <FlaskConical className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">SafeWaste Test Login</h1>
        <p className="text-sm text-zinc-400 max-w-sm">
          Development only. Each dashboard has its own test username and password (see
          <span className="font-mono text-zinc-300"> docs/test-users.md</span>).
        </p>
      </div>
      <div className="w-full max-w-sm bg-[#111116] border border-white/[0.08] rounded-2xl p-6 shadow-2xl">
        <DevLoginForm />
      </div>
    </div>
  );
}
