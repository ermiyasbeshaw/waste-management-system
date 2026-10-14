CREATE TYPE "public"."facility_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."facility_type" AS ENUM('REFERRAL_HOSPITAL', 'GENERAL_HOSPITAL', 'PRIMARY_HOSPITAL', 'CLINIC', 'PHARMACY', 'DISPOSAL_SITE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'hospital_admin', 'hospital_staff', 'driver', 'disposal_operator', 'efda_officer');--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "facility_type" NOT NULL,
	"status" "facility_status" DEFAULT 'ACTIVE' NOT NULL,
	"region" text NOT NULL,
	"city" text,
	"sub_city" text,
	"woreda" text,
	"kebele" text,
	"address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facilities_code_unique" UNIQUE("code"),
	CONSTRAINT "facilities_code_format" CHECK ("facilities"."code" ~ '^[A-Z]{2}-[A-Z]{3}-[0-9]{3}$'),
	CONSTRAINT "facilities_lat_range" CHECK ("facilities"."lat" BETWEEN -90 AND 90),
	CONSTRAINT "facilities_lng_range" CHECK ("facilities"."lng" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"role" "user_role",
	"facility_id" uuid,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone_e164" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"receives_pickup_otp" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_facility_by_role" CHECK (("users"."role" IN ('hospital_admin', 'hospital_staff', 'disposal_operator') AND "users"."facility_id" IS NOT NULL)
       OR ("users"."role" IN ('super_admin', 'driver', 'efda_officer') AND "users"."facility_id" IS NULL)
       OR ("users"."role" IS NULL AND "users"."facility_id" IS NULL)),
	CONSTRAINT "users_otp_recipient_rules" CHECK (NOT "users"."receives_pickup_otp"
       OR ("users"."role" IN ('hospital_admin', 'hospital_staff') AND "users"."phone_verified" AND "users"."phone_e164" IS NOT NULL)),
	CONSTRAINT "users_phone_e164_format" CHECK ("users"."phone_e164" IS NULL OR "users"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "users_phone_verified_needs_phone" CHECK (NOT "users"."phone_verified" OR "users"."phone_e164" IS NOT NULL),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facilities_type_status_idx" ON "facilities" USING btree ("type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_facility_role_idx" ON "users" USING btree ("facility_id","role");