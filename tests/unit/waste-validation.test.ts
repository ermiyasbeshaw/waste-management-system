import { describe, expect, it } from "vitest";
import { registerWasteSchema } from "@/lib/validation/waste";

const ok = { categoryCode: "INFECTIOUS", containerCount: 3, weightKg: 12.5 };
const errorsOf = (input: unknown) => {
  const r = registerWasteSchema.safeParse(input);
  return r.success ? {} : r.error.flatten().fieldErrors;
};

describe("waste registration input (CLAUDE.md §6)", () => {
  it("accepts a valid registration and coerces form strings to numbers", () => {
    expect(registerWasteSchema.parse(ok)).toEqual(ok);
    expect(
      registerWasteSchema.parse({ categoryCode: " SHARPS ", containerCount: "2", weightKg: "4.25" })
    ).toEqual({ categoryCode: "SHARPS", containerCount: 2, weightKg: 4.25 });
  });

  it("requires a category", () => {
    expect(errorsOf({ ...ok, categoryCode: "" }).categoryCode).toBeTruthy();
    expect(errorsOf({ ...ok, categoryCode: undefined }).categoryCode).toBeTruthy();
    expect(errorsOf({ ...ok, categoryCode: "x'; DROP TABLE" }).categoryCode).toBeTruthy();
  });

  it("container_count >= 1, whole numbers, sane maximum", () => {
    for (const bad of [0, -1, 1.5, 101, "abc"]) {
      expect(errorsOf({ ...ok, containerCount: bad }).containerCount, String(bad)).toBeTruthy();
    }
    expect(errorsOf({ ...ok, containerCount: 100 }).containerCount).toBeUndefined();
  });

  it("weight_kg > 0, at most 2 decimals, sane maximum", () => {
    for (const bad of [0, -3, 1.234, 10_001, "kg"]) {
      expect(errorsOf({ ...ok, weightKg: bad }).weightKg, String(bad)).toBeTruthy();
    }
    expect(errorsOf({ ...ok, weightKg: 0.01 }).weightKg).toBeUndefined();
  });

  it("ignores any facility sent by the client (the facility always comes from the session)", () => {
    const parsed = registerWasteSchema.parse({ ...ok, facilityId: "someone-else" });
    expect(parsed).not.toHaveProperty("facilityId");
  });
});
