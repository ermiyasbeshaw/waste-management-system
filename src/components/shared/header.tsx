"use client";

import React from "react";
import { ShieldCheck } from "lucide-react";
import { DevAccountMenu } from "@/components/dev/dev-account-menu";
import { AccountMenu } from "@/server/auth/clerk-ui";
import { useDevSession } from "@/components/dev/dev-role-provider";
import { ROLE_CONFIGS } from "@/types";

/**
 * Desktop header. The search box, theme, notifications and settings buttons of the prototype were removed
 * in Gate 1a because those features do not exist yet (CLAUDE.md §13: no buttons for non-existent features).
 */
export function Header() {
  const { activeRole } = useDevSession();
  const config = activeRole ? ROLE_CONFIGS[activeRole] : null;

  return (
    <header className="h-16 border-b border-white/[0.07] bg-[#09090c]/80 backdrop-blur-md sticky top-0 z-20 px-6 flex items-center justify-end">
      <div className="flex items-center gap-3">
        {/* Workspace Pill */}
        {config && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#15151e] border border-white/[0.08] text-xs font-medium text-zinc-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{config.workspaceName}</span>
          </div>
        )}

        {/* Development test login + sign out (renders nothing for Clerk sessions and in production) */}
        <DevAccountMenu />

        {/* Clerk account menu (sign out); renders nothing without a Clerk session */}
        <AccountMenu />
      </div>
    </header>
  );
}
