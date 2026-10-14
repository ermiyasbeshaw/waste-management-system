"use client";

import React from "react";
import { Shield } from "lucide-react";
import { ROLE_CONFIGS } from "@/types";
import { useDevSession } from "@/components/dev/dev-role-provider";
import { DevAccountMenu } from "@/components/dev/dev-account-menu";
import { AccountMenu } from "@/server/auth/clerk-ui";

/** Compact header for the mobile-first areas (/driver, /disposal). */
export function MobileTopBar() {
  const { activeRole } = useDevSession();
  const config = activeRole ? ROLE_CONFIGS[activeRole] : null;

  return (
    <header className="sticky top-0 z-20 h-14 border-b border-white/[0.07] bg-[#09090c]/90 backdrop-blur-md px-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5">
          <div className="w-full h-full bg-[#0a0a0d] rounded-full flex items-center justify-center">
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="font-bold text-white text-sm leading-tight">SafeWaste</div>
          {config && (
            <div className="text-[11px] text-zinc-400 truncate leading-tight">
              {config.workspaceName}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <DevAccountMenu compact />
        <AccountMenu />
      </div>
    </header>
  );
}
