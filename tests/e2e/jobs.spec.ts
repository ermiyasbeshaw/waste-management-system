import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

/** POST /api/jobs/outbox is public but protected by CRON_SECRET (CLAUDE.md §3, §6). */
test.describe("outbox job route", () => {
  test("refuses requests without the job secret (401)", async ({ request }) => {
    for (const headers of [{}, { authorization: "Bearer wrong-secret" }] as Record<
      string,
      string
    >[]) {
      const res = await request.post("/api/jobs/outbox", { headers });
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("runs with the job secret and returns counts only", async ({ request }) => {
    const res = await request.post("/api/jobs/outbox", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    expect(Object.keys(await res.json()).sort()).toEqual(["expired", "failed", "retrying", "sent"]);
  });

  test("GET is not allowed", async ({ request }) => {
    expect((await request.get("/api/jobs/outbox")).status()).toBe(405);
  });
});

/** GET /api/health is public: database check and version only (CLAUDE.md §6). */
test("health check answers without sign-in and shows no data", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ status: "ok", database: "ok" });
  expect(Object.keys(body).sort()).toEqual(["database", "latencyMs", "status", "version"]);
});
