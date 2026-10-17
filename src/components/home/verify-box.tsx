"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

/** "Verify a certificate": accepts the verification code or the full link from the certificate's QR code. */
export function VerifyBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const token = value.trim().split("/").filter(Boolean).pop() ?? "";
    if (!/^[A-Za-z0-9_-]{22,100}$/.test(token)) {
      setError("Paste the link from the certificate's QR code, or its verification code.");
      return;
    }
    router.push(`/verify/${token}`);
  };

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 w-full max-w-xl">
      <label htmlFor="verify-token" className="sr-only">
        Certificate link or verification code
      </label>
      <input
        id="verify-token"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        placeholder="Paste certificate link or code (e.g. CERT-2026-0001)"
        autoComplete="off"
        className="flex-1 min-h-[50px] rounded-full bg-[#f8faf8] border border-[#cbe0d0] px-5 text-sm text-[#0a3822] placeholder:text-zinc-400 focus:outline-none focus:border-[#0a3822] shadow-inner"
      />
      <button
        type="submit"
        className="min-h-[50px] px-8 rounded-full bg-[#0a3822] hover:bg-[#072818] text-white text-xs font-bold tracking-tight inline-flex items-center justify-center gap-2 shadow-md hover:scale-105 transition-all"
      >
        <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        Verify Now
      </button>
      {error && (
        <p role="alert" className="text-xs text-rose-600 font-semibold sm:basis-full text-center">
          {error}
        </p>
      )}
    </form>
  );
}
