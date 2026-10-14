"use client";

import React, { useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchKey?: keyof T;
  /** Text to search in; use when the searched value is nested (e.g. `row.facility.name`). */
  getSearchText?: (item: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
  filterComponent?: React.ReactNode;
  title?: string;
  description?: string;
}

export function DataTable<T extends object>({
  data,
  columns,
  searchKey,
  getSearchText,
  searchPlaceholder = "Search records...",
  pageSize = 6,
  emptyMessage = "No records found",
  filterComponent,
  title,
  description,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = data.filter((item) => {
    if (!searchTerm || (!searchKey && !getSearchText)) return true;
    const raw = getSearchText ? getSearchText(item) : item[searchKey as keyof T];
    const value = String(raw || "").toLowerCase();
    return value.includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = filteredData.slice(startIndex, startIndex + pageSize);

  return (
    <div className="bg-[#111116] border border-white/[0.07] rounded-2xl overflow-hidden">
      {(title || searchKey || getSearchText || filterComponent) && (
        <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {title && (
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wide">{title}</h3>
              {description && <p className="text-xs text-zinc-400 mt-0.5">{description}</p>}
            </div>
          )}

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {(searchKey || getSearchText) && (
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full bg-[#16161e] text-xs text-zinc-200 placeholder-zinc-500 rounded-xl pl-9 pr-4 py-2 border border-white/[0.08] focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            )}
            {filterComponent}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] bg-[#14141b]/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={clsx(
                    "py-3.5 px-4 text-zinc-400 font-medium uppercase tracking-wider text-[11px]",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-zinc-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-[#161622]/60 transition-colors duration-150 text-zinc-200"
                >
                  {columns.map((col) => (
                    <td key={col.key} className={clsx("py-3 px-4", col.className)}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "-")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
          <div>
            Showing <span className="text-zinc-200 font-medium">{startIndex + 1}</span> to{" "}
            <span className="text-zinc-200 font-medium">
              {Math.min(startIndex + pageSize, filteredData.length)}
            </span>{" "}
            of <span className="text-zinc-200 font-medium">{filteredData.length}</span> results
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-white/[0.08] bg-[#16161e] text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.05]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-zinc-300">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-white/[0.08] bg-[#16161e] text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.05]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
