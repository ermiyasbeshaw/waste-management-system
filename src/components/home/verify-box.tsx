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
        placeholder="Paste the certificate link or code"
        autoComplete="off"
        className="flex-1 min-h-[48px] rounded-xl bg-[#161622] border border-white/[0.12] px-4 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/60"
      />
      <button
        type="submit"
        className="min-h-[48px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold inline-flex items-center justify-center gap-2"
      >
        <ShieldCheck className="w-4 h-4" aria-hidden="true" />
        Verify
      </button>
      {error && (
        <p role="alert" className="text-sm text-rose-300 sm:basis-full">
          {error}
        </p>
      )}
    </form>
  );
}
