import { afterAll, describe, expect, it } from "vitest";
import {
  closeTestPool,
  inRolledBackTransaction,
  insertFacility,
  insertUser,
  testPool,
  userParams,
  userSql,
  violation,
} from "./db";

afterAll(closeTestPool);

describe("schema is migrated on the dev branch", () => {
  it("has the tables, enums and triggers", async () => {
    const { rows } = await testPool().query(`
      SELECT
        (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
           AND table_name IN ('users', 'facilities'))::int AS tables,
        (SELECT count(*) FROM pg_type WHERE typname IN ('user_role', 'facility_type', 'facility_status'))::int AS enums,
        (SELECT count(*) FROM pg_trigger WHERE tgname IN ('users_facility_type_by_role',
           'facilities_type_locked_with_users', 'users_set_updated_at', 'facilities_set_updated_at'))::int AS triggers`);
    expect(rows[0]).toEqual({ tables: 2, enums: 3, triggers: 4 });
  });
});

describe("facilities", () => {
  it("requires the DD-XXX-000 code format and unique codes", () =>
    inRolledBackTransaction(async (c) => {
      await insertFacility(c, "DD-TST-901");
      const insert = `INSERT INTO facilities (code, name, type, region, address, lat, lng)
                      VALUES ($1, 'X', 'CLINIC', 'Dire Dawa', 'X', 9.6, 41.8)`;
      expect(await violation(c, insert, ["bad-code"])).toBe("facilities_code_format");
      expect(await violation(c, insert, ["DD-TST-901"])).toBe("facilities_code_unique");
    }));

  it("generates time-ordered UUID v7 ids", () =>
    inRolledBackTransaction(async (c) => {
      const a = await insertFacility(c, "DD-TST-902");
      const b = await insertFacility(c, "DD-TST-903");
      expect(a[14]).toBe("7"); // UUID version nibble
      expect(a < b).toBe(true);
    }));
});

describe("users: facility depends on role (CLAUDE.md §3)", () => {
  it("hospital roles and disposal_operator need a facility; the others must not have one", () =>
    inRolledBackTransaction(async (c) => {
      const hospital = await insertFacility(c, "DD-TST-911");
      const site = await insertFacility(c, "DD-DIS-912", "DISPOSAL_SITE");

      for (const role of ["hospital_admin", "hospital_staff", "disposal_operator"]) {
        expect(await violation(c, userSql, userParams({ role }))).toBe("users_facility_by_role");
      }
      for (const role of ["super_admin", "driver", "efda_officer"]) {
        expect(await violation(c, userSql, userParams({ role, facilityId: hospital }))).toBe(
          "users_facility_by_role"
        );
        await insertUser(c, { role }); // allowed without facility
      }
      // No role yet (waiting for access): no facility allowed.
      expect(await violation(c, userSql, userParams({ role: null, facilityId: hospital }))).toBe(
        "users_facility_by_role"
      );
      await insertUser(c, { role: null });

      await insertUser(c, { role: "hospital_staff", facilityId: hospital });
      await insertUser(c, { role: "disposal_operator", facilityId: site });
    }));

  it("disposal_operator must belong to a DISPOSAL_SITE, hospital roles must not (trigger)", () =>
    inRolledBackTransaction(async (c) => {
      const hospital = await insertFacility(c, "DD-TST-921");
      const site = await insertFacility(c, "DD-DIS-922", "DISPOSAL_SITE");
      expect(
        await violation(c, userSql, userParams({ role: "disposal_operator", facilityId: hospital }))
      ).toBe("users_facility_type_by_role");
      expect(
        await violation(c, userSql, userParams({ role: "hospital_staff", facilityId: site }))
      ).toBe("users_facility_type_by_role");

      // Also enforced on UPDATE, and the facility type is locked once users belong to it.
      const id = await insertUser(c, { role: "hospital_admin", facilityId: hospital });
      expect(
        await violation(c, `UPDATE users SET facility_id = $1 WHERE id = $2`, [site, id])
      ).toBe("users_facility_type_by_role");
      expect(
        await violation(c, `UPDATE facilities SET type = 'DISPOSAL_SITE' WHERE id = $1`, [hospital])
      ).toBe("facilities_type_locked_with_users");
    }));
});

describe("users: pickup OTP recipients (CLAUDE.md §6)", () => {
  it("only hospital users with a verified phone can receive pickup OTPs", () =>
    inRolledBackTransaction(async (c) => {
      const hospital = await insertFacility(c, "DD-TST-931");
      const verified = { phone: "+251911000001", phoneVerified: true, receivesOtp: true };

      expect(await violation(c, userSql, userParams({ role: "driver", ...verified }))).toBe(
        "users_otp_recipient_rules"
      );
      expect(
        await violation(
          c,
          userSql,
          userParams({
            role: "hospital_staff",
            facilityId: hospital,
            ...verified,
            phoneVerified: false,
          })
        )
      ).toBe("users_otp_recipient_rules");
      // A user without a role can never be an OTP recipient (NULL role must not slip through the CHECK).
      expect(await violation(c, userSql, userParams({ role: null, ...verified }))).toBe(
        "users_otp_recipient_rules"
      );
      await insertUser(c, { role: "hospital_staff", facilityId: hospital, ...verified });
    }));

  it("validates phone format, verified-needs-phone, lowercase unique emails and unique Clerk ids", () =>
    inRolledBackTransaction(async (c) => {
      expect(await violation(c, userSql, userParams({ phone: "0911000001" }))).toBe(
        "users_phone_e164_format"
      );
      expect(await violation(c, userSql, userParams({ phoneVerified: true }))).toBe(
        "users_phone_verified_needs_phone"
      );
      expect(await violation(c, userSql, userParams({ email: "Upper@Example.test" }))).toBe(
        "users_email_lowercase"
      );
      await insertUser(c, { email: "same@example.test", clerkId: "user_same" });
      expect(await violation(c, userSql, userParams({ email: "same@example.test" }))).toBe(
        "users_email_unique"
      );
      expect(await violation(c, userSql, userParams({ clerkId: "user_same" }))).toBe(
        "users_clerk_user_id_unique"
      );
    }));
});

describe("integrity", () => {
  it("a facility with users cannot be deleted (ON DELETE RESTRICT)", () =>
    inRolledBackTransaction(async (c) => {
      const hospital = await insertFacility(c, "DD-TST-941");
      await insertUser(c, { role: "hospital_admin", facilityId: hospital });
      expect(await violation(c, `DELETE FROM facilities WHERE id = $1`, [hospital])).toBe(
        "users_facility_id_facilities_id_fk"
      );
    }));

  it("updated_at is set by the database on UPDATE", () =>
    inRolledBackTransaction(async (c) => {
      const id = await insertFacility(c, "DD-TST-951");
      // now() is fixed inside a transaction, so backdate first, then update.
      await c.query(`UPDATE facilities SET updated_at = now() - interval '1 day' WHERE id = $1`, [
        id,
      ]);
      const { rows } = await c.query(
        `UPDATE facilities SET name = 'Renamed' WHERE id = $1 RETURNING updated_at >= now() - interval '1 minute' AS fresh`,
        [id]
      );
      expect(rows[0].fresh).toBe(true);
    }));
});
