import React from "react";
import { clsx } from "clsx";
import { STATUS_META, type BadgeTone, type DerivedFlag, type StatusValue } from "@/lib/statuses";

/** Any v1.2 status value (CLAUDE.md §5) or a derived flag such as OVERDUE. */
export type AnyStatus = StatusValue | DerivedFlag;

interface StatusBadgeProps {
  status: AnyStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const TONES: Record<BadgeTone, { bg: string; text: string; border: string; dot: string }> = {
  success: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  progress: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/20",
    dot: "bg-blue-400 animate-pulse",
  },
  warning: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/20",
    dot: "bg-amber-400",
  },
  info: {
    bg: "bg-cyan-500/10",
    text: "text-cyan-400",
    border: "border-cyan-500/20",
    dot: "bg-cyan-400",
  },
  draft: {
    bg: "bg-purple-500/10",
    text: "text-purple-300",
    border: "border-purple-500/20",
    dot: "bg-purple-400",
  },
  danger: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/20",
    dot: "bg-rose-400",
  },
  neutral: {
    bg: "bg-zinc-800/60",
    text: "text-zinc-300",
    border: "border-zinc-700/50",
    dot: "bg-zinc-400",
  },
};

/** Status chip: colour AND text, never colour alone (CLAUDE.md §9). */
export function StatusBadge({ status, size = "md", className }: StatusBadgeProps) {
  const meta = STATUS_META[status] ?? { label: String(status).replace(/_/g, " "), tone: "neutral" };
  const tone = TONES[meta.tone];

  const sizeClasses = {
    sm: "text-[10px] px-2 py-0.5 gap-1.5",
    md: "text-xs px-2.5 py-1 gap-1.5",
    lg: "text-sm px-3.5 py-1.5 gap-2 font-medium",
  };

  return (
    <span
      data-status={status}
      className={clsx(
        "inline-flex items-center font-medium rounded-full border tracking-wide uppercase shadow-sm transition-colors",
        sizeClasses[size],
        tone.bg,
        tone.text,
        tone.border,
        className
      )}
    >
      <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", tone.dot)} aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}
