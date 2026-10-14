import React from "react";
import { LucideIcon, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { clsx } from "clsx";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: "emerald" | "blue" | "purple" | "amber" | "cyan" | "rose";
  trend?: {
    value: string;
    isPositive?: boolean;
    isWarning?: boolean;
  };
  onClick?: () => void;
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "emerald",
  trend,
  onClick,
  className,
}: KpiCardProps) {
  const colorMap = {
    emerald: {
      iconBg: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
      glow: "hover:border-emerald-500/30",
    },
    blue: {
      iconBg: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
      glow: "hover:border-blue-500/30",
    },
    purple: {
      iconBg: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
      glow: "hover:border-purple-500/30",
    },
    amber: {
      iconBg: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
      glow: "hover:border-amber-500/30",
    },
    cyan: {
      iconBg: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
      glow: "hover:border-cyan-500/30",
    },
    rose: {
      iconBg: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
      glow: "hover:border-rose-500/30",
    },
  };

  const selectedColor = colorMap[color] || colorMap.emerald;

  return (
    <div
      onClick={onClick}
      className={clsx(
        "relative group bg-[#111116] border border-white/[0.07] rounded-2xl p-5 transition-all duration-200",
        selectedColor.glow,
        onClick && "cursor-pointer hover:bg-[#15151e]",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl font-bold text-white tracking-tight font-mono">{value}</div>
          <p className="text-xs text-zinc-400 mt-1.5 font-medium">{title}</p>
        </div>
        <div
          className={clsx(
            "p-3 rounded-xl transition-transform duration-200 group-hover:scale-105",
            selectedColor.iconBg
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {(trend || subtitle) && (
        <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between text-xs">
          {trend ? (
            <div
              className={clsx(
                "flex items-center gap-1.5 font-medium",
                trend.isWarning
                  ? "text-rose-400"
                  : trend.isPositive
                    ? "text-emerald-400"
                    : "text-zinc-400"
              )}
            >
              {trend.isWarning ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : trend.isPositive ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              <span>{trend.value}</span>
            </div>
          ) : (
            <span className="text-zinc-500">{subtitle}</span>
          )}

          {subtitle && trend && <span className="text-zinc-500 text-[11px]">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
