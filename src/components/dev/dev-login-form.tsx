"use client";

import { useFormState, useFormStatus } from "react-dom";
import { LogIn } from "lucide-react";
import { devLogin, type DevLoginState } from "@/server/auth/dev-login-actions";

const initialState: DevLoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black text-sm font-semibold transition-colors"
    >
      <LogIn className="w-4 h-4" aria-hidden="true" />
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

/** Username + password form for the development test login. */
export function DevLoginForm() {
  const [state, formAction] = useFormState(devLogin, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="username" className="block text-sm font-medium text-zinc-200">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="w-full min-h-[48px] rounded-xl bg-[#161622] border border-white/[0.1] px-4 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60"
          placeholder="e.g. sw_admin"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-zinc-200">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full min-h-[48px] rounded-xl bg-[#161622] border border-white/[0.1] px-4 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/60"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-rose-400">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
