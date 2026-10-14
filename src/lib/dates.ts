/**
 * Date helpers (CLAUDE.md §9): timestamps are stored in UTC and shown in Africa/Addis_Ababa (EAT, UTC+3,
 * no daylight saving). Every displayed date goes through these functions; the Ethiopian calendar can be
 * added here later (E14) without touching components.
 */

export const APP_TIME_ZONE = "Africa/Addis_Ababa";
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

type DateInput = Date | string | number;

function toDate(input: DateInput): Date {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${String(input)}`);
  return d;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const PARTS_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "7 Oct 2026" in EAT. */
export function formatDate(input: DateInput): string {
  return DATE_FMT.format(toDate(input));
}

/** "14:05" in EAT (24-hour). */
export function formatTime(input: DateInput): string {
  return TIME_FMT.format(toDate(input));
}

/** "7 Oct 2026, 14:05" in EAT. */
export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  return `${formatDate(d)}, ${formatTime(d)}`;
}

/** Calendar date in EAT as "YYYY-MM-DD" (e.g. for grouping or code generation). */
export function toEatDateString(input: DateInput): string {
  return PARTS_FMT.format(toDate(input));
}

/**
 * The EAT calendar month containing `input`, as UTC instants: `start` inclusive, `end` exclusive.
 * Used for monthly invoices and "this month" KPIs (month boundaries are in EAT, not UTC).
 */
export function eatMonthRange(input: DateInput): { start: Date; end: Date; label: string } {
  const [y, m] = toEatDateString(input).split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - EAT_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, 1) - EAT_OFFSET_MS);
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(start);
  return { start, end, label };
}

/** Whole days between two instants (b − a), rounded down. */
export function daysBetween(a: DateInput, b: DateInput): number {
  return Math.floor((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}
