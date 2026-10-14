/** Money helpers (CLAUDE.md §9): amounts are integer santim (ETB × 100), shown as ETB. */

const ETB_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Converts a decimal ETB amount (e.g. prototype mock data) to integer santim. */
export function etbToSantim(etb: number): number {
  return Math.round(etb * 100);
}

/** Formats integer santim as "12,345.67 ETB". */
export function formatEtb(santim: number): string {
  return `${ETB_FORMAT.format(santim / 100)} ETB`;
}
