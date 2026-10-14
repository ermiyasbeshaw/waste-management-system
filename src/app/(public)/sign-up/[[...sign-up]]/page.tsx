import { Shield } from "lucide-react";
import Link from "next/link";
import { SignUpPanel } from "@/server/auth/clerk-ui";

/** /sign-up — Clerk registration with email OTP verification. */
export default function SignUpPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 py-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-glow">
          <Shield className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Create an Account</h1>
        <p className="text-sm text-zinc-400">SafeWaste Medical Waste Tracking Network</p>
      </div>
      <SignUpPanel />
      <p className="text-xs text-zinc-500 max-w-sm text-center">
        Already registered?{" "}
        <Link
          href="/sign-in"
          className="text-emerald-400 hover:text-emerald-300 underline font-medium"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
