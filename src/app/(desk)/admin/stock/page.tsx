import { redirect } from "next/navigation";

/** /admin/stock — medicine stock is strictly for the hospital desk; redirected away for super admin. */
export default function AdminStockPage() {
  redirect("/admin");
}

