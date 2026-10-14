import { describe, expect, it } from "vitest";
import { ROLE_CONFIGS } from "@/types/auth";

describe("ROLE_CONFIGS", () => {
  it("defines exactly the six roles from CLAUDE.md §3", () => {
    expect(Object.keys(ROLE_CONFIGS).sort()).toEqual(
      [
        "disposal_operator",
        "driver",
        "efda_officer",
        "hospital_admin",
        "hospital_staff",
        "super_admin",
      ].sort()
    );
  });

  it("sends each role to its own area", () => {
    expect(ROLE_CONFIGS.super_admin.defaultPath).toBe("/admin");
    expect(ROLE_CONFIGS.hospital_admin.defaultPath).toBe("/hospital");
    expect(ROLE_CONFIGS.hospital_staff.defaultPath).toBe("/hospital");
    expect(ROLE_CONFIGS.driver.defaultPath).toBe("/driver");
    expect(ROLE_CONFIGS.disposal_operator.defaultPath).toBe("/disposal");
    expect(ROLE_CONFIGS.efda_officer.defaultPath).toBe("/regulator");
  });
});
