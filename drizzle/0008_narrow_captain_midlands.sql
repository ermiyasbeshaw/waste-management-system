CREATE TYPE "public"."onboarding_request_status" AS ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "onboarding_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone_e164" text,
	"requested_role" "user_role" NOT NULL,
	"facility_id" uuid,
	"facility_name" text,
	"facility_type" "facility_type",
	"facility_region" text,
	"facility_city" text,
	"facility_address" text,
	"facility_lat" double precision,
	"facility_lng" double precision,
	"status" "onboarding_request_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"notes" text,
	"rejection_reason" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_requests_status_idx" ON "onboarding_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "onboarding_requests_facility_idx" ON "onboarding_requests" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "onboarding_requests_clerk_user_idx" ON "onboarding_requests" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_one_active_hospital_admin_idx" ON "users" USING btree ("facility_id") WHERE "users"."role" = 'hospital_admin' AND "users"."active" = true;