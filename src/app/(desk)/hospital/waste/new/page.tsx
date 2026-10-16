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
        Hospital Staff sends medical waste requests below. Select <b>Expired Drugs</b> (requires Hospital Admin approval followed by EFDA regulatory approval) or <b>Normal Drugs</b> (requires Hospital Admin approval, then Super Admin assigns a driver).
      </p>
      <RegisterWasteForm categories={categories} />
    </div>
  );
}
