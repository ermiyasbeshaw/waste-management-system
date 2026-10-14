import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { log, newRequestId } from "@/server/log";
import pkg from "../../../../package.json";

/**
 * GET /api/health (CLAUDE.md §6): public; a database round trip and the app version — no data. 200 when the
 * database answers, 503 otherwise (for uptime monitoring).
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const started = Date.now();
  const headers = { "Cache-Control": "no-store" };
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    return Response.json(
      { status: "ok", database: "ok", version: pkg.version, latencyMs: Date.now() - started },
      { headers }
    );
  } catch (err) {
    log.warn("Health check: database unreachable", {
      requestId: newRequestId(),
      error: String(err),
    });
    return Response.json(
      { status: "degraded", database: "unreachable", version: pkg.version },
      { status: 503, headers }
    );
  }
}
