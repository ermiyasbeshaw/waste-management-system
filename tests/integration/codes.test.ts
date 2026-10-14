import { afterAll, describe, expect, it } from "vitest";
import { nextCode } from "@/server/db/codes";
import { AppError } from "@/server/errors";
import {
  closeTestPool,
  drizzleOn,
  inCommittedTransaction,
  inRolledBackTransaction,
  testPool,
} from "./db";

// A period far in the future, so test counters never touch real ones; removed after the tests.
const FUTURE = new Date("2099-03-15T09:00:00Z");

afterAll(async () => {
  await testPool().query(
    `DELETE FROM code_sequences WHERE period LIKE '99%' OR period LIKE '2099%'`
  );
  await closeTestPool();
});

describe("nextCode (Gate 2.3)", () => {
  it("counts up per period inside a transaction", () =>
    inRolledBackTransaction(async (c) => {
      const tx = drizzleOn(c);
      expect(await nextCode(tx, "waste", FUTURE)).toBe("WR-9903-00001");
      expect(await nextCode(tx, "waste", FUTURE)).toBe("WR-9903-00002");
      expect(await nextCode(tx, "waste", new Date("2099-04-01T09:00:00Z"))).toBe("WR-9904-00001");
      expect(await nextCode(tx, "invoice", FUTURE)).toBe("INV-2099-03-0001");
    }));

  it("50 concurrent transactions get 50 different, consecutive numbers", async () => {
    const codes = await Promise.all(
      Array.from({ length: 50 }, () =>
        inCommittedTransaction((tx) => nextCode(tx, "contract", FUTURE))
      )
    );
    expect(new Set(codes).size).toBe(50);
    const numbers = codes.map((c) => Number(c.slice(-4))).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("a rolled-back number is handed out again (it was never used)", async () => {
    await inRolledBackTransaction(async (c) => {
      expect(await nextCode(drizzleOn(c), "certificate", FUTURE)).toBe("CD-2099-00001");
    });
    await inRolledBackTransaction(async (c) => {
      expect(await nextCode(drizzleOn(c), "certificate", FUTURE)).toBe("CD-2099-00001");
    });
  });

  it("refuses to wrap around when a period is full", () =>
    inRolledBackTransaction(async (c) => {
      await c.query(
        `INSERT INTO code_sequences (scope, period, last_value) VALUES ('trip', '990315', 99)`
      );
      const err = await nextCode(drizzleOn(c), "trip", FUTURE).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("CODE_SEQUENCE_EXHAUSTED");
    }));
});
