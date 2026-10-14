import { invoiceMonthSchema } from "@/lib/validation/billing";
import { previousMonth } from "@/lib/billing";
import { toEatDateString } from "@/lib/dates";
import { AppError, errorResponse } from "@/server/errors";
import { requireCronAuth } from "@/server/jobs/cron-auth";
import { log, newRequestId } from "@/server/log";
import { generateMonthlyInvoices } from "@/server/services/billing";

/**
 * Monthly invoices job (CLAUDE.md §6): POST-only with `Authorization: Bearer <CRON_SECRET>`. Creates DRAFT
 * invoices for the previous month (EAT), or for `{ "month": "YYYY-MM" }`. Running it twice creates nothing new.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    requireCronAuth(req);
    const text = await req.text();
    let month = previousMonth(toEatDateString(new Date()));
    if (text.trim()) {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new AppError("BAD_REQUEST", 400, "The request body is not valid JSON.");
      }
      const parsed = invoiceMonthSchema.safeParse(body);
      if (!parsed.success)
        throw new AppError("VALIDATION_ERROR", 422, 'Use { "month": "YYYY-MM" }.');
      month = parsed.data.month;
    }
    const summary = await generateMonthlyInvoices(month, null, requestId);
    log.info("Monthly invoices job finished", { requestId, ...summary });
    return Response.json(summary);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
