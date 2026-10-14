import { getStockAlerts } from "@/server/queries/medicine";
import { StockAlertsPanel } from "./stock-alerts-panel";

/**
 * Dashboard widget (CLAUDE.md §8: one async Server Component per widget): medicine expiry alerts in the viewer's
 * scope — own facility for hospital roles, every facility for super_admin and EFDA (CLAUDE.md §12).
 */
export async function StockAlertsWidget({
  href,
  showFacility,
}: {
  href: string;
  showFacility: boolean;
}) {
  return <StockAlertsPanel rows={await getStockAlerts()} showFacility={showFacility} href={href} />;
}
