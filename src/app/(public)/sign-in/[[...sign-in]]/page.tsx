import { Shield } from "lucide-react";
import { SignInPanel } from "@/server/auth/clerk-ui";

/** /sign-in — Clerk sign-in (accounts are invitation-only; there is no public sign-up). */
export default function SignInPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 py-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-glow">
          <Shield className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">SafeWaste Portal</h1>
        <p className="text-sm text-zinc-400">Medical waste tracking · Dire Dawa</p>
      </div>
      <SignInPanel />
      <p className="text-xs text-zinc-500 max-w-sm text-center">
        Access is by invitation only. Ask your facility administrator or the SafeWaste operations
        team for an invitation.
      </p>
    </div>
  );
}
