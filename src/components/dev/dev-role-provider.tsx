"use client";

import React, { createContext, useContext } from "react";
import { UserRole, ROLE_CONFIGS } from "@/types";

/**
 * Session context for client components. Everything here comes from the SERVER (the current user's row in
 * the `users` table), passed by the root layout — nothing about identity or role is decided in the browser.
 */
export const DEV_TOOLS_ENABLED = process.env.NODE_ENV === "development";

export interface SessionProfile {
  fullName: string;
  /** Display title of the role, e.g. "Hospital Staff / EHO". */
  roleTitle: string;
}

interface DevSessionValue {
  /** Display profile of the signed-in user, or null. */
  user: SessionProfile | null;
  activeRole: UserRole | null;
  /** Username of the development test login, or null (Clerk session / signed out). */
  devUsername: string | null;
}

const DevSessionContext = createContext<DevSessionValue | undefined>(undefined);

export function DevRoleProvider({
  children,
  initialRole,
  fullName,
  devUsername,
}: {
  children: React.ReactNode;
  initialRole: UserRole | null;
  fullName: string | null;
  devUsername: string | null;
}) {
  const user =
    initialRole && fullName ? { fullName, roleTitle: ROLE_CONFIGS[initialRole].label } : null;

  return (
    <DevSessionContext.Provider value={{ user, activeRole: initialRole, devUsername }}>
      {children}
    </DevSessionContext.Provider>
  );
}

export function useDevSession() {
  const context = useContext(DevSessionContext);
  if (!context) {
    throw new Error("useDevSession must be used within a DevRoleProvider");
  }
  return context;
}
