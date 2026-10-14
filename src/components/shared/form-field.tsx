import type { ReactNode } from "react";

/** Input styling shared by every form (dark zinc, emerald focus, rose when invalid). */
export const inputClass =
  "w-full min-h-[44px] bg-[#161622] text-sm text-zinc-100 border border-white/[0.1] rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500/60 aria-[invalid=true]:border-rose-500/70 disabled:opacity-50";

export const primaryButtonClass =
  "min-h-[44px] px-5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black";

export const secondaryButtonClass =
  "min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl text-sm font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08]";

export const dangerButtonClass =
  "min-h-[44px] px-4 rounded-xl text-sm font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 disabled:opacity-60";

/** Label + control + error / hint, wired for screen readers (the control gets `aria-describedby`). */
export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-200">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-rose-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Banner for a server-side error message. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3"
    >
      {message}
    </p>
  );
}
