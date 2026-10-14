"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { WeeklyVolume } from "@/types/view-models";

/** Change of the last full week against the week before, or null when there is nothing to compare. */
function weekOverWeek(weekly: WeeklyVolume[]): number | null {
  if (weekly.length < 3) return null;
  const [before, last] = [weekly[weekly.length - 3].kg, weekly[weekly.length - 2].kg];
  return before > 0 ? ((last - before) / before) * 100 : null;
}

/** 8-week volume trend: kg of waste registered per week (EAT, Monday to Sunday). */
export function WeeklyTrendChart({ weekly }: { weekly: WeeklyVolume[] }) {
  const change = weekOverWeek(weekly);
  return (
    <div className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">8-Week Hazardous Waste Trend</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Waste registered per week (kg); the last point is the current week so far
          </p>
        </div>
        {change !== null && (
          <div
            className={`flex items-center gap-1.5 text-xs font-medium ${change >= 0 ? "text-emerald-400" : "text-rose-400"}`}
          >
            {change >= 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            <span>
              {change >= 0 ? "+" : ""}
              {change.toFixed(1)}% vs. previous week
            </span>
          </div>
        )}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={weekly}>
            <defs>
              <linearGradient id="colorKg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="weekLabel" stroke="#71717a" fontSize={11} tickLine={false} />
            <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#161622",
                borderColor: "rgba(255,255,255,0.1)",
                borderRadius: "10px",
                fontSize: "11px",
              }}
            />
            <Area
              type="monotone"
              dataKey="kg"
              stroke="#6366f1"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorKg)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
