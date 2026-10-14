import { notFound } from "next/navigation";
import { getCertificateForVerification } from "@/server/queries/verify";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  ShieldCheck,
  ShieldAlert,
  Building2,
  Calendar,
  Flame,
  Hash,
  Tag,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { FileCheck } from "@/components/verify/file-check";

/**
 * /verify/[token] — public certificate verification (no sign-in). Shows only the fields of the v1.2 DECISION:
 * certificate number, status, issue date, facility, Waste ID, category, container count, weight, destruction date
 * and method — never person names, phone numbers or emails. Unknown token → 404. An ISSUED certificate can be
 * downloaded; any visitor can compare a PDF file with the original (SHA-256, Gate 5.4).
 */
export default async function VerifyCertificatePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const cert = await getCertificateForVerification(params.token);
  if (!cert) notFound();

  const isRevoked = cert.status === "REVOKED";

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4">
      <div className="bg-[#111116] border border-white/[0.08] rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-6 shadow-2xl">
        {/* Certificate Verification Header */}
        <div className="text-center space-y-2">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
              isRevoked
                ? "bg-rose-500/10 border border-rose-500/30 text-rose-400"
                : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-glow"
            }`}
          >
            {isRevoked ? <ShieldAlert className="w-8 h-8" /> : <ShieldCheck className="w-8 h-8" />}
          </div>

          <span className="text-[11px] font-mono tracking-widest text-zinc-400 uppercase block">
            SafeWaste · Certificate of Disposal
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Hazardous Waste Destruction Certificate
          </h2>
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="font-mono text-xs text-zinc-300 font-bold">{cert.certificateNo}</span>
            <StatusBadge status={cert.status} size="sm" />
          </div>
        </div>

        {/* Revoked Warning */}
        {isRevoked && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-xs text-rose-300 space-y-1">
            <span className="font-bold block text-rose-200">THIS CERTIFICATE HAS BEEN REVOKED</span>
            <p>It is no longer valid. Ask the issuer for the current certificate.</p>
          </div>
        )}

        {/* Certificate Data Matrix */}
        <div className="bg-[#161622] rounded-2xl p-5 border border-white/[0.05] space-y-3.5 text-xs">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.05]">
            <span className="text-zinc-400 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-zinc-500" />
              <span>Originating Facility:</span>
            </span>
            <span className="font-semibold text-white">{cert.facilityName}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.05]">
            <span className="text-zinc-400 flex items-center gap-2">
              <Hash className="w-4 h-4 text-zinc-500" />
              <span>Waste ID:</span>
            </span>
            <span className="font-mono text-zinc-200">{cert.wasteCode}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.05]">
            <span className="text-zinc-400 flex items-center gap-2">
              <Tag className="w-4 h-4 text-zinc-500" />
              <span>Category:</span>
            </span>
            <span className="text-zinc-200 text-right">{cert.categoryName}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.05]">
            <span className="text-zinc-400 flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" />
              <span>Destroyed Volume:</span>
            </span>
            <span className="font-mono font-bold text-white">
              {cert.weightKg} kg ({cert.containerCount} Containers)
            </span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.05]">
            <span className="text-zinc-400 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-zinc-500" />
              <span>Destruction Date:</span>
            </span>
            <span className="font-mono text-zinc-200">{formatDate(cert.destroyedOn)}</span>
          </div>

          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.05]">
            <span className="text-zinc-400 flex items-center gap-2">
              <Flame className="w-4 h-4 text-zinc-500" />
              <span>Destruction Method:</span>
            </span>
            <span className="text-zinc-200 text-right">{cert.destructionMethodName}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-zinc-500" />
              <span>Certificate Issued:</span>
            </span>
            <span className="font-mono text-zinc-200">{formatDate(cert.issuedOn)}</span>
          </div>
        </div>

        {/* Verification Token Footprint */}
        <div className="flex items-center justify-between px-3 text-[11px] text-zinc-500 font-mono">
          <span className="break-all">Verify Token: {cert.verifyToken}</span>
        </div>

        {!isRevoked && (
          <a
            href={`/api/verify/${cert.verifyToken}/pdf`}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500 text-black"
          >
            Download the certificate (PDF)
          </a>
        )}
        <FileCheck token={cert.verifyToken} />

        {/* Return Button */}
        <div className="pt-2">
          <Link
            href="/admin"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to SafeWaste Portal</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
