import React from "react";
import { FolderSearch } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title = "No data found",
  description = "There are currently no records or activity matching this view.",
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-[#111116] border border-white/[0.07] rounded-2xl">
      <div className="p-3 bg-zinc-800/40 text-zinc-400 rounded-2xl mb-3 border border-white/[0.05]">
        {icon || <FolderSearch className="w-6 h-6" />}
      </div>
      <h4 className="text-sm font-semibold text-zinc-200">{title}</h4>
      <p className="text-xs text-zinc-400 max-w-sm mt-1 mb-4">{description}</p>
      {action}
    </div>
  );
}
