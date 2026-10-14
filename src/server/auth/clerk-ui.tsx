"use client";

/**
 * Clerk UI components, wrapped here so that all Clerk imports stay in src/server/auth/ (CLAUDE.md §2).
 * Pages and shared components import these wrappers, never `@clerk/*` directly.
 */
import { SignIn, SignUp, SignedIn, UserButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

const appearance = {
  baseTheme: dark,
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
    card: "!bg-[#111116] !border !border-white/[0.08] shadow-2xl",
    socialButtonsBlockButton:
      "!bg-[#161622] !border !border-white/[0.15] hover:!bg-white/[0.08] !text-white transition-colors",
    socialButtonsBlockButtonText: "!text-white font-medium text-sm",
    socialButtonsProviderIcon: "!opacity-100",
    dividerLine: "!bg-white/[0.15]",
    dividerText: "!text-zinc-300 font-medium",
    formFieldLabel: "!text-zinc-200 font-medium",
    formFieldInput:
      "!bg-[#161622] !border !border-white/[0.15] !text-white placeholder:!text-zinc-500",
    formButtonPrimary:
      "!bg-emerald-500 hover:!bg-emerald-400 !text-black font-semibold shadow-glow",
    footerActionText: "!text-zinc-300",
    footerActionLink: "!text-emerald-400 hover:!text-emerald-300 font-medium",
    userButtonPopoverCard: "!bg-[#111116] !border !border-white/[0.15] !text-zinc-100 shadow-2xl",
    userButtonPopoverActionButton:
      "!text-zinc-100 hover:!text-white hover:!bg-white/[0.08] transition-colors",
    userButtonPopoverActionButtonText: "!text-zinc-100 hover:!text-white font-medium text-sm",
    userButtonPopoverActionButtonIcon: "!text-zinc-300 hover:!text-white",
    userButtonPopoverActionButtonIconBox: "!text-zinc-300 hover:!text-white",
    userButtonPopoverFooter: "!border-t !border-white/[0.1]",
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
