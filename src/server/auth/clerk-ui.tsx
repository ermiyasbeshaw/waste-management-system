"use client";

/**
 * Clerk UI components, wrapped here so that all Clerk imports stay in src/server/auth/ (CLAUDE.md §2).
 * Pages and shared components import these wrappers, never `@clerk/*` directly.
 */
import { SignIn, SignedIn, UserButton } from "@clerk/nextjs";

const appearance = {
  variables: {
    colorPrimary: "#10b981",
    colorBackground: "#111116",
    colorText: "#f4f4f5",
    colorTextSecondary: "#a1a1aa",
    colorInputBackground: "#161622",
    colorInputText: "#f4f4f5",
    borderRadius: "0.75rem",
  },
};

/** The Clerk sign-in form (invitation-only: there is no sign-up link). */
export function SignInPanel() {
  return <SignIn routing="path" path="/sign-in" appearance={appearance} />;
}

/** Account menu with sign-out, shown only when a Clerk session exists. */
export function AccountMenu() {
  return (
    <SignedIn>
      <UserButton appearance={appearance} />
    </SignedIn>
  );
}
