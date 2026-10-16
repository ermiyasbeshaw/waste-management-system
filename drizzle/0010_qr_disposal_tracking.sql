ALTER TYPE "medicine_request_status" ADD VALUE IF NOT EXISTS 'RECEIVED_BY_DRIVER';--> statement-breakpoint
ALTER TYPE "medicine_request_status" ADD VALUE IF NOT EXISTS 'RECEIVED_AT_FACILITY';--> statement-breakpoint
ALTER TYPE "medicine_request_status" ADD VALUE IF NOT EXISTS 'DISPOSED';--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "qr_code" text;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "driver_id" uuid REFERENCES "public"."users"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "driver_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "operator_id" uuid REFERENCES "public"."users"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "operator_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "disposed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "certificate_no" text;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "certificate_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD COLUMN IF NOT EXISTS "certificate_pdf_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "medicine_disposal_requests_qr_code_unique" ON "medicine_disposal_requests" USING btree ("qr_code");--> statement-breakpoint
UPDATE "medicine_disposal_requests" SET "qr_code" = 'QR-' || "request_code" WHERE "qr_code" IS NULL;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" DROP CONSTRAINT IF EXISTS "medicine_disposal_requests_approved_waste";--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD CONSTRAINT "medicine_disposal_requests_approved_waste" CHECK ("status" IN ('PENDING_APPROVAL', 'REJECTED') OR "waste_record_id" IS NOT NULL);
