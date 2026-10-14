ALTER TABLE "users" DROP CONSTRAINT "users_facility_by_role";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_otp_recipient_rules";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_facility_by_role" CHECK (("users"."role" IS NULL AND "users"."facility_id" IS NULL)
       OR ("users"."role" IS NOT NULL AND "users"."role" IN ('hospital_admin', 'hospital_staff', 'disposal_operator') AND "users"."facility_id" IS NOT NULL)
       OR ("users"."role" IS NOT NULL AND "users"."role" IN ('super_admin', 'driver', 'efda_officer') AND "users"."facility_id" IS NULL));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_otp_recipient_rules" CHECK (NOT "users"."receives_pickup_otp"
       OR ("users"."role" IS NOT NULL AND "users"."role" IN ('hospital_admin', 'hospital_staff') AND "users"."phone_verified" AND "users"."phone_e164" IS NOT NULL));