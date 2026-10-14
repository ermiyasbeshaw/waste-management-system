"use client";

import { BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CategoryVolume } from "@/types/view-models";

/** 30-day waste volume by MoH category (bar chart + legend). */
export function CategoryChart({ data }: { data: { categoryVolume30d: CategoryVolume[] } }) {
  return (
    <div className="lg:col-span-4 bg-[#111116] border border-white/[0.07] rounded-2xl p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">30-Day Waste Volume</h3>
          <BarChart3 className="w-4 h-4 text-zinc-400" />
        </div>
        <p className="text-xs text-zinc-400 mt-0.5">
          Kg registered in the last 30 days, by MoH category
        </p>
      </div>

      <div className="h-56 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data.categoryVolume30d}
            layout="vertical"
            margin={{ left: -20, right: 10 }}
          >
            <XAxis type="number" stroke="#71717a" fontSize={10} tickLine={false} />
            <YAxis
              dataKey="code"
              type="category"
              stroke="#71717a"
              fontSize={9}
              tickLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#161622",
                borderColor: "rgba(255,255,255,0.1)",
                borderRadius: "10px",
                fontSize: "11px",
              }}
            />
            <Bar dataKey="kg" radius={[0, 6, 6, 0]}>
              {data.categoryVolume30d.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.colourHex} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.05] text-[10px]">
        {data.categoryVolume30d.slice(0, 4).map((c) => (
          <div key={c.code} className="flex items-center gap-1.5 text-zinc-400">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.colourHex }} />
            <span className="truncate">
              {c.code}: {c.kg}kg
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
