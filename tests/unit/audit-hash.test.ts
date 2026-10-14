import { describe, expect, it } from "vitest";
import {
  auditHash,
  canonicalJson,
  findSecretKey,
  toJsonValue,
  type AuditHashInput,
} from "@/server/audit/hash";

const base: AuditHashInput = {
  prevHash: null,
  actorUserId: "0190a1b2-0000-7000-8000-000000000001",
  role: "super_admin",
  action: "stop.override",
  entityType: "trip_stop",
  entityId: "0190a1b2-0000-7000-8000-000000000002",
  before: { status: "ARRIVED" },
  after: { status: "COLLECTED_OVERRIDE", reason: "Phone lost" },
  ip: "127.0.0.1",
  requestId: "req-1",
  createdAt: new Date("2026-10-09T08:00:00.123Z"),
};

describe("audit hash chain (CLAUDE.md §6)", () => {
  it("is a 64-char hex SHA-256 and deterministic", () => {
    expect(auditHash(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(auditHash(base)).toBe(auditHash({ ...base }));
  });

  it("ignores key order (jsonb does not keep it)", () => {
    const reordered = { ...base, after: { reason: "Phone lost", status: "COLLECTED_OVERRIDE" } };
    expect(auditHash(reordered)).toBe(auditHash(base));
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });

  it("changes when any field or the previous hash changes", () => {
    const h = auditHash(base);
    const variants: Partial<AuditHashInput>[] = [
      { prevHash: "a".repeat(64) },
      { actorUserId: null },
      { role: "driver" },
      { action: "stop.skip" },
      { entityType: "trip" },
      { entityId: "x" },
      { before: { status: "PENDING" } },
      { after: null },
      { ip: null },
      { requestId: "req-2" },
      { createdAt: new Date("2026-10-09T08:00:00.124Z") },
    ];
    for (const v of variants) expect(auditHash({ ...base, ...v }), JSON.stringify(v)).not.toBe(h);
  });

  it("normalises values the way jsonb stores them", () => {
    expect(toJsonValue(undefined)).toBeNull();
    expect(
      toJsonValue({ at: new Date("2026-10-09T08:00:00Z"), n: BigInt(10), skip: undefined })
    ).toEqual({
      at: "2026-10-09T08:00:00.000Z",
      n: "10",
    });
  });

  it("finds secrets anywhere in before/after", () => {
    expect(findSecretKey({ status: "ISSUED", recipients: 2 })).toBeNull();
    expect(findSecretKey({ code: "DD-REF-001" })).toBeNull();
    expect(findSecretKey({ otp: { code_hash: "x" } })).toBe("otp");
    expect(findSecretKey({ device: { token_hash: "x" } })).toBe("device.token_hash");
    expect(findSecretKey([{ ok: 1 }, { Password: "x" }])).toBe("[1].Password");
  });
});
