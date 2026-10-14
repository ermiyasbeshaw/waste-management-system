/**
 * Billing arithmetic (CLAUDE.md §6, §9): money is integer santim; VAT is copied onto the invoice at creation.
 * Pure functions, unit-tested, shared by the invoice service and the seed checks.
 *
 * ASSUMPTIONS (same rules as the seed, to be confirmed with the client):
 * - A month is billed when it STARTS inside the contract (start_date ≤ 1st of the month < end_date); the full
 *   monthly fee is charged (no proration for part months).
 * - VAT = subtotal × rate / 100, rounded half up to the santim.
 * - The monthly job bills the previous calendar month (EAT) unless a month is given.
 */

const MONTH = /^(\d{4})-(\d{2})$/;

/** VAT in santim for a subtotal in santim, rounded half up. */
export function vatSantim(subtotalSantim: number, ratePercent: number): number {
  if (!Number.isInteger(subtotalSantim) || subtotalSantim < 0) {
    throw new RangeError("Subtotal must be a whole number of santim, 0 or more");
  }
  if (!(ratePercent >= 0 && ratePercent <= 100)) throw new RangeError("VAT rate must be 0–100");
  return Math.round((subtotalSantim * ratePercent) / 100);
}

export function invoiceAmounts(subtotalSantim: number, ratePercent: number) {
  const vat = vatSantim(subtotalSantim, ratePercent);
  return { subtotalSantim, vatSantim: vat, totalSantim: subtotalSantim + vat };
}

/** First and last calendar day of a month "YYYY-MM", as "YYYY-MM-DD". */
export function monthPeriod(month: string): { periodStart: string; periodEnd: string } {
  const m = MONTH.exec(month);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new RangeError(`Not a month: ${month}`);
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return {
    periodStart: `${m[1]}-${m[2]}-01`,
    periodEnd: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`,
  };
}

/** The month before the EAT calendar date `today` ("YYYY-MM-DD") as "YYYY-MM". */
export function previousMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Is the month billed under a contract running [startDate, endDate)? */
export function isBillableMonth(month: string, startDate: string, endDate: string): boolean {
  const { periodStart } = monthPeriod(month);
  return startDate <= periodStart && periodStart < endDate;
}

/** Due date = issue date (EAT calendar date) + `invoice_due_days`. */
export function dueDate(issuedOn: string, dueDays: number): string {
  const [y, m, d] = issuedOn.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dueDays)).toISOString().slice(0, 10);
}

/** Contract status for a date (daily job): EXPIRED from end_date; EXPIRING_SOON within the warning window. */
export function contractStatusOn(
  today: string,
  endDate: string,
  warningDays: number
): "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" {
  if (today >= endDate) return "EXPIRED";
  return dueDate(today, warningDays) >= endDate ? "EXPIRING_SOON" : "ACTIVE";
}
