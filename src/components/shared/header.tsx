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
    <header className="h-16 border-b border-white/[0.07] bg-[#09090c]/80 backdrop-blur-md sticky top-0 z-20 px-4 md:px-6 flex items-center justify-between">
      {/* Mobile Brand & Role Display */}
      <div className="flex md:hidden items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div>
          <span className="font-bold text-xs text-white tracking-tight block leading-tight">SafeWaste</span>
          {config && (
            <span className="text-[10px] text-zinc-400 font-medium block leading-none truncate max-w-[120px]">
              {config.label}
            </span>
          )}
        </div>
      </div>

      {/* Desktop Left Spacer */}
      <div className="hidden md:block" />

      <div className="flex items-center gap-2.5">
        {/* Workspace Pill */}
        {config && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#15151e] border border-white/[0.08] text-xs font-medium text-zinc-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{config.workspaceName}</span>
          </div>
        )}

        {/* Development test login + sign out */}
        <DevAccountMenu compact />

        {/* Clerk account menu (sign out) */}
        <AccountMenu />
      </div>
    </header>
  );
}
