ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "vehicle_id" uuid REFERENCES "public"."vehicles"("id") ON DELETE restrict;-->statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "destination_facility_id" uuid REFERENCES "public"."facilities"("id") ON DELETE restrict;
