import Link from "next/link";
import { getHospitalCategories } from "@/server/queries/hospital";
import { RegisterWasteForm } from "@/components/hospital/register-waste-form";

/**
 * /hospital/waste/new — register waste for the signed-in user's own facility (hospital roles). Medicine is not
 * registered here: it needs an EFDA-approved disposal request (CLAUDE.md §12, owner decision 11 Oct 2026).
 */
export default async function RegisterWastePage() {
  const categories = await getHospitalCategories();
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-300 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
        Expired or unwanted <b>medicines</b> are not registered here: they need EFDA approval first.
        The Hospital Administrator requests it in{" "}
        <Link href="/hospital/stock/requests" className="text-emerald-400 underline">
          Medicine Stock → Disposal requests
        </Link>
        . Sharps, infectious and other waste are registered directly below.
      </p>
      <RegisterWasteForm categories={categories} />
    </div>
  );
}
