import { toEatDateString } from "./dates";

/**
 * Human codes (CLAUDE.md §9): unique, never reused, shown to users instead of UUIDs. The number part comes from
 * a per-period counter in `code_sequences` (see `src/server/db/codes.ts`); periods are calendar periods in EAT.
 *
 *   waste        WR-YYMM-NNNNN      restarts monthly
 *   trip         TR-YYMMDD-NN       restarts daily
 *   certificate  CD-YYYY-NNNNN      restarts yearly
 *   invoice      INV-YYYY-MM-NNNN   restarts monthly
 *   contract     CT-YYYY-NNNN       restarts yearly
 *   container    <waste code>-CNN   no counter: the container's seq_no (3 digits from 100)
 */

export const CODE_SPECS = {
  waste: { prefix: "WR", width: 5, pattern: /^WR-\d{4}-\d{5}$/ },
  trip: { prefix: "TR", width: 2, pattern: /^TR-\d{6}-\d{2}$/ },
  certificate: { prefix: "CD", width: 5, pattern: /^CD-\d{4}-\d{5}$/ },
  invoice: { prefix: "INV", width: 4, pattern: /^INV-\d{4}-\d{2}-\d{4}$/ },
  contract: { prefix: "CT", width: 4, pattern: /^CT-\d{4}-\d{4}$/ },
  /** Medicine disposal request (CLAUDE.md §12), e.g. MD-2026-00007. */
  medicine_request: { prefix: "MD", width: 5, pattern: /^MD-\d{4}-\d{5}$/ },
} as const;

export type CodeKind = keyof typeof CODE_SPECS;
export const CODE_KINDS = Object.keys(CODE_SPECS) as CodeKind[];

export const CONTAINER_CODE_PATTERN = /^WR-\d{4}-\d{5}-C\d{2,3}$/;
export const MAX_CONTAINER_SEQ = 999;

/** The highest number a period can hold (e.g. 99 trips a day). */
export function maxSequence(kind: CodeKind): number {
  return 10 ** CODE_SPECS[kind].width - 1;
}

/** The counter period of `at` for this kind, e.g. waste → "2610", trip → "261009", invoice → "2026-10". */
export function codePeriod(kind: CodeKind, at: Date | string | number): string {
  const [yyyy, mm, dd] = toEatDateString(at).split("-");
  const yy = yyyy.slice(2);
  switch (kind) {
    case "waste":
      return `${yy}${mm}`;
    case "trip":
      return `${yy}${mm}${dd}`;
    case "invoice":
      return `${yyyy}-${mm}`;
    case "certificate":
    case "contract":
    case "medicine_request":
      return yyyy;
  }
}

/** Builds a code from its period and number; refuses numbers outside 1 … maxSequence. */
export function formatCode(kind: CodeKind, period: string, n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > maxSequence(kind)) {
    throw new RangeError(`${kind} number ${n} is outside 1–${maxSequence(kind)}`);
  }
  const spec = CODE_SPECS[kind];
  return `${spec.prefix}-${period}-${String(n).padStart(spec.width, "0")}`;
}

export function isCode(kind: CodeKind, value: string): boolean {
  return CODE_SPECS[kind].pattern.test(value);
}

/** Container code = waste code + "-C" + seq (2 digits, 3 from 100). Matches the database trigger. */
export function containerCode(wasteCode: string, seq: number): string {
  if (!isCode("waste", wasteCode)) throw new RangeError(`Not a waste code: ${wasteCode}`);
  if (!Number.isInteger(seq) || seq < 1 || seq > MAX_CONTAINER_SEQ) {
    throw new RangeError(`Container number ${seq} is outside 1–${MAX_CONTAINER_SEQ}`);
  }
  return `${wasteCode}-C${String(seq).padStart(2, "0")}`;
}
