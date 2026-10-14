import { redirect } from "next/navigation";

/** There is no finance role or area: billing lives in /admin/finance (CLAUDE.md §3). */
export default function FinanceRedirectPage() {
  redirect("/admin/finance");
}
