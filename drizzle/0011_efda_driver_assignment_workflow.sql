-- Add new statuses for EFDA approval and driver assignment workflow
ALTER TYPE "medicine_request_status" ADD VALUE IF NOT EXISTS 'PENDING_EFDA_APPROVAL';-->statement-breakpoint
ALTER TYPE "medicine_request_status" ADD VALUE IF NOT EXISTS 'PENDING_DRIVER_ASSIGNMENT';-->statement-breakpoint

-- Add column to track who assigned the driver (super admin)
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "assigned_by" uuid REFERENCES "public"."users"("id") ON DELETE restrict;-->statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone;-->statement-breakpoint

-- Add column to track whether the request contains expired medicines (for EFDA routing)
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "contains_expired" boolean DEFAULT false;-->statement-breakpoint

-- Add column for EFDA decision tracking (separate from hospital admin decision)
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "efda_decided_by" uuid REFERENCES "public"."users"("id") ON DELETE restrict;-->statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "efda_decided_at" timestamp with time zone;-->statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "efda_decision_reason" text;-->statement-breakpoint

-- Relax the approved_waste constraint to allow the new intermediate statuses
ALTER TABLE "medicine_disposal_requests" DROP CONSTRAINT IF EXISTS "medicine_disposal_requests_approved_waste";-->statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD CONSTRAINT "medicine_disposal_requests_approved_waste" CHECK ("status" IN ('PENDING_APPROVAL', 'REJECTED', 'PENDING_EFDA_APPROVAL', 'PENDING_DRIVER_ASSIGNMENT') OR "waste_record_id" IS NOT NULL);-->statement-breakpoint

-- Relax the decision_fields constraint for the new intermediate statuses
ALTER TABLE "medicine_disposal_requests" DROP CONSTRAINT IF EXISTS "medicine_disposal_requests_decision_fields";-->statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD CONSTRAINT "medicine_disposal_requests_decision_fields" CHECK (("status" = 'PENDING_APPROVAL') = ("decided_by" IS NULL AND "decided_at" IS NULL));
