import { describe, expect, it } from "vitest";
import { isTransientDbError, withDbRetry } from "@/server/db/retry";

describe("withDbRetry (read-only calls)", () => {
  it("retries network failures such as Neon waking up, then succeeds", async () => {
    let calls = 0;
    const result = await withDbRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new TypeError("fetch failed");
        return "ok";
      },
      { baseDelayMs: 1 }
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry SQL errors", async () => {
    let calls = 0;
    const sqlError = Object.assign(
      new Error('violates check constraint "users_facility_by_role"'),
      {
        code: "23514",
      }
    );
    await expect(
      withDbRetry(
        async () => {
          calls += 1;
          throw sqlError;
        },
        { baseDelayMs: 1 }
      )
    ).rejects.toBe(sqlError);
    expect(calls).toBe(1);
  });

  it("gives up after the last attempt", async () => {
    let calls = 0;
    await expect(
      withDbRetry(
        async () => {
          calls += 1;
          throw new Error("Connection terminated unexpectedly");
        },
        { attempts: 2, baseDelayMs: 1 }
      )
    ).rejects.toThrow("Connection terminated");
    expect(calls).toBe(2);
  });

  it("recognises network errors wrapped in a cause", () => {
    const wrapped = new Error("Error connecting to database", { cause: new Error("ETIMEDOUT") });
    expect(isTransientDbError(wrapped)).toBe(true);
    expect(isTransientDbError("text")).toBe(false);
  });

  it("recognises a dropped Neon WebSocket: the cause is an ErrorEvent (not an Error, no message)", () => {
    class ErrorEvent {
      type = "error";
    }
    const failed = new Error('Failed query: select "id" from "users"', { cause: new ErrorEvent() });
    expect(isTransientDbError(failed)).toBe(true);
    // A SQL error with an ordinary cause is still not retried.
    const sqlError = new Error("Failed query", {
      cause: new Error("duplicate key value violates unique constraint"),
    });
    expect(isTransientDbError(sqlError)).toBe(false);
  });
});
