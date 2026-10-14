import "server-only";
import { sql } from "drizzle-orm";
import { codePeriod, formatCode, maxSequence, type CodeKind } from "@/lib/codes";
import { AppError } from "@/server/errors";
import type { DbExecutor } from "./executor";
import { codeSequences } from "./schema";

/**
 * Takes the next human code of `kind` for the period containing `at` (EAT), e.g. "WR-2610-00042".
 * One atomic upsert in the caller's transaction: concurrent callers block on the counter row and each gets its
 * own number. If the transaction rolls back, the number was never used and is handed out again.
 */
export async function nextCode(
  tx: DbExecutor,
  kind: CodeKind,
  at: Date = new Date()
): Promise<string> {
  const period = codePeriod(kind, at);
  const [row] = await tx
    .insert(codeSequences)
    .values({ scope: kind, period, lastValue: 1 })
    .onConflictDoUpdate({
      target: [codeSequences.scope, codeSequences.period],
      set: { lastValue: sql`${codeSequences.lastValue} + 1` },
    })
    .returning({ n: codeSequences.lastValue });

  if (row.n > maxSequence(kind)) {
    throw new AppError(
      "CODE_SEQUENCE_EXHAUSTED",
      409,
      `No ${kind} numbers left for period ${period}`,
      { kind, period }
    );
  }
  return formatCode(kind, period, row.n);
}
