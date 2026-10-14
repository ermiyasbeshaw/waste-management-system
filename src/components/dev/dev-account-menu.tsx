"use client";

import { FlaskConical, LogOut } from "lucide-react";
import { devLogout } from "@/server/auth/dev-login-actions";
import { useDevSession } from "./dev-role-provider";

/**
 * Shows which development test login is active, with a Sign out button. Renders nothing for Clerk sessions
 * and never in production (no test logins exist there).
 */
export function DevAccountMenu({ compact = false }: { compact?: boolean }) {
  const { devUsername } = useDevSession();
  if (!devUsername) return null;

  return (
    <form action={devLogout} className="flex items-center gap-2">
      <span
        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-dashed border-amber-500/40 bg-[#161622] text-xs text-zinc-200"
        title="Development test login"
      >
        <FlaskConical className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
        <span className="font-mono text-[10px] text-amber-400">TEST</span>
        <span className="font-mono truncate max-w-[10rem]">{devUsername}</span>
      </span>
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl text-xs font-medium text-rose-300 bg-[#161622] hover:bg-rose-500/10 border border-white/[0.08] transition-colors"
      >
        <LogOut className="w-4 h-4" aria-hidden="true" />
        {!compact && <span>Sign out</span>}
        {compact && <span className="sr-only">Sign out</span>}
      </button>
    </form>
  );
}
