"use client";

import { useState, type FormEvent } from "react";
import { FileSearch } from "lucide-react";

/**
 * Public file check (Gate 5.4, DECISION v1.2): the visitor uploads the PDF they were given; the server compares its
 * SHA-256 with the stored one. The file is not kept.
 */
export function FileCheck({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/verify/${token}/check-file`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, text: body?.error?.message ?? "The file could not be checked." });
      } else if (body.match) {
        setResult({
          ok: body.status === "ISSUED",
          text:
            body.status === "ISSUED"
              ? `This file is the original certificate ${body.certificateNo}.`
              : `This file is certificate ${body.certificateNo}, but it has been REVOKED and is no longer valid.`,
        });
      } else {
        setResult({
          ok: false,
          text: "This file does NOT match the certificate on record. It may have been changed.",
        });
      }
    } catch {
      setResult({ ok: false, text: "No connection. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-2xl border border-white/[0.06] p-4">
      <p className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
        <FileSearch className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        Check a certificate file
      </p>
      <label className="block text-[11px] text-zinc-400">
        Choose the PDF you received to compare it with the original
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-xs text-zinc-300"
        />
      </label>
      <button
        type="submit"
        disabled={!file || busy}
        className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-black disabled:opacity-50"
      >
        {busy ? "Checking…" : "Compare file"}
      </button>
      {result && (
        <p
          role="status"
          className={`text-xs font-medium ${result.ok ? "text-emerald-300" : "text-rose-300"}`}
        >
          {result.text}
        </p>
      )}
    </form>
  );
}
