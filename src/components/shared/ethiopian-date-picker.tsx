"use client";

import React, { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, Check, Globe } from "lucide-react";
import {
  ETHIOPIAN_MONTHS,
  toEthiopianDate,
  toGregorianIso,
  type EthiopianDate,
} from "@/lib/ethiopian-calendar";

interface EthiopianDatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (isoDate: string) => void;
  label?: string;
  minDate?: string;
  className?: string;
}

export function EthiopianDatePicker({
  value,
  onChange,
  label = "Proposed Date / Schedule",
  minDate,
  className = "",
}: EthiopianDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"ethiopian" | "gregorian">("ethiopian");
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute current Ethiopian Date from value
  const ethDate: EthiopianDate = React.useMemo(() => {
    try {
      return toEthiopianDate(value || new Date());
    } catch {
      return toEthiopianDate(new Date());
    }
  }, [value]);

  const [selEthYear, setSelEthYear] = useState<number>(ethDate.year);
  const [selEthMonth, setSelEthMonth] = useState<number>(ethDate.month);
  const [selEthDay, setSelEthDay] = useState<number>(ethDate.day);

  useEffect(() => {
    setSelEthYear(ethDate.year);
    setSelEthMonth(ethDate.month);
    setSelEthDay(ethDate.day);
  }, [ethDate]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleEthChange = (newYear: number, newMonth: number, newDay: number) => {
    setSelEthYear(newYear);
    setSelEthMonth(newMonth);
    setSelEthDay(newDay);
    try {
      const gregIso = toGregorianIso(newYear, newMonth, newDay);
      onChange(gregIso);
    } catch {
      /* ignore invalid intermediate day */
    }
  };

  const daysInMonth = selEthMonth === 13 ? (selEthYear % 4 === 3 ? 6 : 5) : 30;

  return (
    <div ref={containerRef} className={`relative space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-zinc-300">
          {label}
        </label>
      )}

      {/* Main Visible Date Trigger Box */}
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full min-h-[46px] bg-[#161622] hover:bg-[#1a1a28] border border-emerald-500/30 hover:border-emerald-400/60 rounded-xl px-3.5 py-2 flex items-center justify-between cursor-pointer transition-all shadow-sm group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0 group-hover:scale-105 transition-transform">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-white tracking-wide">
                {value}
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-1.5 py-0.5 rounded font-medium">
                Gregorian
              </span>
            </div>
            <div className="text-[11px] text-emerald-400 font-semibold truncate flex items-center gap-1 mt-0.5">
              <span>{ethDate.formattedAmharic}</span>
              <span className="text-zinc-500 font-normal">({ethDate.formatted})</span>
            </div>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180 text-emerald-400" : ""
          }`}
        />
      </div>

      {/* Dropdown Calendar Selector Modal/Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 sm:left-auto sm:right-0 sm:w-96 top-full mt-2 z-50 bg-[#12131a] border border-white/[0.12] rounded-2xl p-4 shadow-2xl space-y-3.5 animate-in fade-in slide-in-from-top-2">
          {/* Calendar Mode Toggle Header */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Select Date System</span>
            </div>
            <div className="flex items-center bg-[#1a1b24] p-0.5 rounded-lg border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setMode("ethiopian")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  mode === "ethiopian"
                    ? "bg-emerald-500 text-black shadow-sm font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                🇪🇹 Ethiopian
              </button>
              <button
                type="button"
                onClick={() => setMode("gregorian")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  mode === "gregorian"
                    ? "bg-emerald-500 text-black shadow-sm font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Gregorian (G.C.)
              </button>
            </div>
          </div>

          {/* Mode 1: Ethiopian Calendar (ዓውደ ወርሕ) */}
          {mode === "ethiopian" ? (
            <div className="space-y-3">
              <div className="bg-[#181924] p-2.5 rounded-xl border border-emerald-500/20 text-center">
                <span className="text-[11px] text-zinc-400 block">Current Ethiopian Date:</span>
                <span className="text-sm font-bold text-emerald-300 block">
                  {ethDate.formattedAmharic}
                </span>
                <span className="text-[11px] text-zinc-400 font-mono">
                  {ethDate.formatted}
                </span>
              </div>

              {/* Month Selector */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-300">
                  Month (ወር)
                </label>
                <select
                  value={selEthMonth}
                  onChange={(e) =>
                    handleEthChange(
                      selEthYear,
                      parseInt(e.target.value, 10),
                      Math.min(selEthDay, parseInt(e.target.value, 10) === 13 ? 5 : 30)
                    )
                  }
                  className="w-full bg-[#181924] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {ETHIOPIAN_MONTHS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}. {m.amharic} ({m.name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Day Selector */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-300">
                    Day (ቀን: 1 - {daysInMonth})
                  </label>
                  <select
                    value={selEthDay}
                    onChange={(e) =>
                      handleEthChange(selEthYear, selEthMonth, parseInt(e.target.value, 10))
                    }
                    className="w-full bg-[#181924] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Year Selector */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-300">
                    Year (ዓመተ ምሕረት)
                  </label>
                  <select
                    value={selEthYear}
                    onChange={(e) =>
                      handleEthChange(parseInt(e.target.value, 10), selEthMonth, selEthDay)
                    }
                    className="w-full bg-[#181924] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {[2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023].map((y) => (
                      <option key={y} value={y}>
                        {y} ዓ.ም ({y} E.C.)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            /* Mode 2: Gregorian Native Calendar (Visible with color-scheme: dark) */
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-300">
                  Gregorian Standard Date (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  min={minDate}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full [color-scheme:dark] bg-[#181924] text-sm text-white font-mono border border-white/[0.15] rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="bg-[#181924] p-2.5 rounded-xl border border-white/[0.06] text-xs text-zinc-300">
                <span className="text-[10px] text-zinc-400 block">Converts Automatically to:</span>
                <span className="font-bold text-emerald-400">
                  {ethDate.formattedAmharic}
                </span>
              </div>
            </div>
          )}

          {/* Action / Done Button */}
          <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">
              Selected: <strong className="text-white font-mono">{value}</strong>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1 shadow"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
