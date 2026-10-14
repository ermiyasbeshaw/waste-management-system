import React from "react";
import { LucideIcon, Database, Shield } from "lucide-react";
import { clsx } from "clsx";

interface PageHeaderProps {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  badgeText?: string;
  badgeColor?: "emerald" | "blue" | "amber" | "rose" | "purple";
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon = Shield,
  badgeText = "LOCAL DEMO STATE: ACTIVE",
  badgeColor = "emerald",
  children,
}: PageHeaderProps) {
  const badgeColors = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-emerald-400">
            <Icon className="w-5 h-5" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">{title}</h1>
        </div>
        <p className="text-xs md:text-sm text-zinc-400 mt-1.5 max-w-3xl leading-relaxed">
          {subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {badgeText && (
          <div
            className={clsx(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-mono font-medium tracking-wide shadow-sm",
              badgeColors[badgeColor]
            )}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{badgeText}</span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
