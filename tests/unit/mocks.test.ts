import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

// The per-area mock tests were removed with the mocks (9–10 Oct 2026); the database queries are covered by
// tests/integration/*-queries.test.ts.
describe("data access isolation", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("the prototype mocks are gone and nothing imports them (Gate 2.17)", () => {
    expect(existsSync("src/mocks")).toBe(false);
    const offenders = [...files("src"), ...files("tests/e2e")].filter((f) =>
      /from ["']@\/mocks/.test(readFileSync(f, "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("every server query starts with a role check (except public verification)", () => {
    for (const f of files("src/server/queries")) {
      // Internal helpers (`_*.ts`) have no access checks; the area modules check BEFORE calling them.
      if (basename(f).startsWith("_") || f.endsWith("verify.ts")) continue;
      expect(readFileSync(f, "utf8"), f).toContain("await requireRole(");
    }
  });

  it("transactions always use withTransaction (one dedicated connection), never db.transaction()", () => {
    // Under the Next.js bundler drizzle's `instanceof Pool` check can fail and spread a transaction over several
    // pooled connections; src/server/db/client.ts explains it (found 10 Oct 2026).
    const offenders = files("src").filter(
      (f) =>
        !f.endsWith(join("db", "client.ts")) && /db\.transaction\(/.test(readFileSync(f, "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("internal query helpers (`_*.ts`) are only used by the query modules, never by pages or components", () => {
    const offenders = [...files("src/app"), ...files("src/components")].filter((f) =>
      /@\/server\/queries\/_/.test(readFileSync(f, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});
