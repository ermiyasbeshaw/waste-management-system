import { afterAll, describe, expect, it } from "vitest";
import { closeTestPool, testPool } from "./db";

afterAll(closeTestPool);

/** R0: `npm run db:seed` must leave one usable dev user per role on the dev branch. */
describe("seeded dev users (npm run db:seed)", () => {
  it("has one active dev user per role, linked to the right kind of facility", async () => {
    const { rows } = await testPool().query(`
      SELECT u.clerk_user_id, u.role, u.active, f.code AS facility, f.type AS facility_type,
             u.phone_verified, u.receives_pickup_otp
      FROM users u LEFT JOIN facilities f ON f.id = u.facility_id
      WHERE u.clerk_user_id LIKE 'dev\_%'
      ORDER BY u.role`);
    const byRole = Object.fromEntries(rows.map((r) => [r.role, r]));

    expect(Object.keys(byRole).sort()).toEqual(
      [
        "disposal_operator",
        "driver",
        "efda_officer",
        "hospital_admin",
        "hospital_staff",
        "super_admin",
      ].sort()
    );
    for (const r of rows) {
      expect(r.clerk_user_id).toBe(`dev_${r.role}`);
      expect(r.active).toBe(true);
    }
    expect(byRole.hospital_admin.facility).toBe("DD-REF-001");
    expect(byRole.hospital_staff.facility).toBe("DD-GEN-002");
    expect(byRole.disposal_operator.facility_type).toBe("DISPOSAL_SITE");
    for (const role of ["super_admin", "driver", "efda_officer"])
      expect(byRole[role].facility).toBeNull();
    // Hospital dev users receive pickup OTPs, so their facilities count as "ready" (CLAUDE.md §6).
    expect(byRole.hospital_admin.receives_pickup_otp && byRole.hospital_admin.phone_verified).toBe(
      true
    );
    expect(byRole.hospital_staff.receives_pickup_otp && byRole.hospital_staff.phone_verified).toBe(
      true
    );
  });
});
