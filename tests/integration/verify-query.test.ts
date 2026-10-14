import { afterAll, describe, expect, it, vi } from "vitest";
import { getCertificateForVerification } from "@/server/queries/verify"; // vi.mock below is hoisted
import { closeTestPool, testPool } from "./db";

/** Gate 2.17: public certificate verification reads the database (DECISION v1.2 addendum fields only). */
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
afterAll(closeTestPool);

const tokenOf = async (status: string) =>
  (
    await testPool().query(
      `SELECT verify_token FROM certificates WHERE status = $1 ORDER BY certificate_no LIMIT 1`,
      [status]
    )
  ).rows[0].verify_token as string;

describe("getCertificateForVerification", () => {
  it("an ISSUED certificate returns exactly the public fields — no names, phones, emails or reasons", async () => {
    const result = await getCertificateForVerification(await tokenOf("ISSUED"));
    expect(Object.keys(result!).sort()).toEqual(
      [
        "certificateNo",
        "status",
        "issuedOn",
        "facilityName",
        "wasteCode",
        "categoryName",
        "containerCount",
        "weightKg",
        "destroyedOn",
        "destructionMethodName",
        "verifyToken",
      ].sort()
    );
    expect(result).toMatchObject({ status: "ISSUED" });
    expect(result!.certificateNo).toMatch(/^CD-\d{4}-\d{5}$/);
    expect(result!.wasteCode).toMatch(/^WR-\d{4}-\d{5}$/);
    expect(result!.issuedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result!.destroyedOn <= result!.issuedOn).toBe(true);
  });

  it("a REVOKED certificate is public and says REVOKED (history kept)", async () => {
    expect(await getCertificateForVerification(await tokenOf("REVOKED"))).toMatchObject({
      status: "REVOKED",
    });
  });

  it("PENDING / FAILED certificates, unknown and malformed tokens are not found", async () => {
    expect(await getCertificateForVerification(await tokenOf("PENDING"))).toBeNull();
    expect(await getCertificateForVerification(await tokenOf("FAILED"))).toBeNull();
    expect(await getCertificateForVerification("unknown-token-0000000000000")).toBeNull();
    expect(await getCertificateForVerification("x' OR '1'='1")).toBeNull();
    expect(await getCertificateForVerification("short")).toBeNull();
  });
});
