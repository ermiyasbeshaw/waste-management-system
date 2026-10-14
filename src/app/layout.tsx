import type { Metadata } from "next";
import "./globals.css";
// Validates the environment at startup (fails fast with variable names, never values).
import "@/env";
import { ClerkProvider } from "@clerk/nextjs";
import { DevRoleProvider } from "@/components/dev/dev-role-provider";
import { getCurrentUserSafe, getDevSession } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "SafeWaste — Biohazard & Medical Waste Tracking Platform",
  description:
    "Next-generation healthcare & biohazard logistics, GIS live tracking, and compliance portal",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The role shown in the UI comes from the server (users table), never from the browser.
  const devUsername = (await getDevSession())?.username ?? null;
  const me = await getCurrentUserSafe();
  const role = me?.active ? me.role : null;
  const fullName = role ? (me?.fullName ?? null) : null;

  return (
    <html lang="en" className="dark">
      <body className="bg-[#08080a] text-zinc-100 min-h-screen antialiased">
        {/* ClerkProvider: identity only (CLAUDE.md §2). Roles come from the users table, not from Clerk. */}
        <ClerkProvider>
          <DevRoleProvider initialRole={role} fullName={fullName} devUsername={devUsername}>
            {children}
          </DevRoleProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
