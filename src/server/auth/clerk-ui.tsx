"use client";

/**
 * Clerk UI components, wrapped here so that all Clerk imports stay in src/server/auth/ (CLAUDE.md §2).
 * Pages and shared components import these wrappers, never `@clerk/*` directly.
 */
import { SignIn, SignUp, SignedIn, UserButton } from "@clerk/nextjs";

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
  elements: {
    userButtonPopoverCard: "!bg-[#111116] !border !border-white/[0.12] !text-zinc-100 shadow-2xl",
    userButtonPopoverActionButton: "!text-zinc-100 hover:!text-white hover:!bg-white/[0.08] transition-colors",
    userButtonPopoverActionButtonText: "!text-zinc-100 hover:!text-white font-medium text-sm",
    userButtonPopoverActionButtonIcon: "!text-zinc-300 hover:!text-white",
    userButtonPopoverActionButtonIconBox: "!text-zinc-300 hover:!text-white",
    userButtonPopoverFooter: "!border-t !border-white/[0.08]",
    userPreviewMainIdentifier: "!text-white font-semibold",
    userPreviewSecondaryIdentifier: "!text-zinc-400",
  },
};

/** The Clerk sign-in form with sign-up link. */
export function SignInPanel() {
  return (
    <SignIn
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/"
      appearance={appearance}
    />
  );
}

/** The Clerk sign-up form with email OTP verification. */
export function SignUpPanel() {
  return (
    <SignUp
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      fallbackRedirectUrl="/"
      appearance={appearance}
    />
  );
}

/** Account menu with sign-out, shown only when a Clerk session exists. */
export function AccountMenu() {
  return (
    <SignedIn>
      <UserButton appearance={appearance} />
    </SignedIn>
  );
}
