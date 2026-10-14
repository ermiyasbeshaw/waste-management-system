CREATE TYPE "public"."medicine_request_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "medicine_disposal_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"request_id" uuid NOT NULL,
	"stock_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"item" text NOT NULL,
	"strength" text NOT NULL,
	"form" text NOT NULL,
	"batch" text NOT NULL,
	"unit" text NOT NULL,
	"expiry_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicine_disposal_request_lines_once" UNIQUE("request_id","stock_id"),
	CONSTRAINT "medicine_disposal_request_lines_quantity_min" CHECK ("medicine_disposal_request_lines"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "medicine_disposal_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"request_code" text NOT NULL,
	"facility_id" uuid NOT NULL,
	"status" "medicine_request_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"requested_by" uuid NOT NULL,
	"note" text,
	"container_count" integer NOT NULL,
	"weight_kg" numeric(10, 2) NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"waste_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicine_disposal_requests_code_format" CHECK ("medicine_disposal_requests"."request_code" ~ '^MD-[0-9]{4}-[0-9]{5}$'),
	CONSTRAINT "medicine_disposal_requests_containers_min" CHECK ("medicine_disposal_requests"."container_count" >= 1),
	CONSTRAINT "medicine_disposal_requests_weight_positive" CHECK ("medicine_disposal_requests"."weight_kg" > 0),
	CONSTRAINT "medicine_disposal_requests_decision_fields" CHECK (("medicine_disposal_requests"."status" = 'PENDING_APPROVAL') = ("medicine_disposal_requests"."decided_by" IS NULL AND "medicine_disposal_requests"."decided_at" IS NULL)),
	CONSTRAINT "medicine_disposal_requests_rejection_reason" CHECK ("medicine_disposal_requests"."status" <> 'REJECTED' OR ("medicine_disposal_requests"."decision_reason" IS NOT NULL AND btrim("medicine_disposal_requests"."decision_reason") <> '')),
	CONSTRAINT "medicine_disposal_requests_approved_waste" CHECK (("medicine_disposal_requests"."status" = 'APPROVED') = ("medicine_disposal_requests"."waste_record_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "medicine_stock" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"facility_id" uuid NOT NULL,
	"item" text NOT NULL,
	"strength" text DEFAULT '' NOT NULL,
	"form" text DEFAULT '' NOT NULL,
	"batch" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit" text NOT NULL,
	"expiry_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicine_stock_quantity_min" CHECK ("medicine_stock"."quantity" >= 0),
	CONSTRAINT "medicine_stock_item_filled" CHECK (("medicine_stock"."item" IS NOT NULL AND btrim("medicine_stock"."item") <> '')),
	CONSTRAINT "medicine_stock_batch_filled" CHECK (("medicine_stock"."batch" IS NOT NULL AND btrim("medicine_stock"."batch") <> '')),
	CONSTRAINT "medicine_stock_unit_filled" CHECK (("medicine_stock"."unit" IS NOT NULL AND btrim("medicine_stock"."unit") <> ''))
);
--> statement-breakpoint
CREATE TABLE "medicine_stock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"stock_id" uuid NOT NULL,
	"threshold_days" integer NOT NULL,
	"alert_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicine_stock_alerts_once" UNIQUE("stock_id","threshold_days"),
	CONSTRAINT "medicine_stock_alerts_threshold_min" CHECK ("medicine_stock_alerts"."threshold_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "code_sequences" DROP CONSTRAINT "code_sequences_scope";--> statement-breakpoint
ALTER TABLE "medicine_disposal_request_lines" ADD CONSTRAINT "medicine_disposal_request_lines_request_id_medicine_disposal_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."medicine_disposal_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_disposal_request_lines" ADD CONSTRAINT "medicine_disposal_request_lines_stock_id_medicine_stock_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."medicine_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD CONSTRAINT "medicine_disposal_requests_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD CONSTRAINT "medicine_disposal_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD CONSTRAINT "medicine_disposal_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_disposal_requests" ADD CONSTRAINT "medicine_disposal_requests_waste_record_id_waste_records_id_fk" FOREIGN KEY ("waste_record_id") REFERENCES "public"."waste_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_stock" ADD CONSTRAINT "medicine_stock_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_stock" ADD CONSTRAINT "medicine_stock_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_stock_alerts" ADD CONSTRAINT "medicine_stock_alerts_stock_id_medicine_stock_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."medicine_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "medicine_disposal_requests_code_unique" ON "medicine_disposal_requests" USING btree ("request_code");--> statement-breakpoint
CREATE INDEX "medicine_disposal_requests_facility_status_idx" ON "medicine_disposal_requests" USING btree ("facility_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "medicine_stock_line_unique" ON "medicine_stock" USING btree ("facility_id",lower("item"),lower("strength"),lower("form"),lower("batch"));--> statement-breakpoint
CREATE INDEX "medicine_stock_facility_expiry_idx" ON "medicine_stock" USING btree ("facility_id","expiry_date");--> statement-breakpoint
ALTER TABLE "code_sequences" ADD CONSTRAINT "code_sequences_scope" CHECK ("code_sequences"."scope" IN ('waste', 'trip', 'certificate', 'invoice', 'contract', 'medicine_request'));--> statement-breakpoint
-- Hand-written (Gate 8): stock and requests belong to health facilities, never to the DISPOSAL_SITE.
CREATE TRIGGER medicine_stock_health_facility
  BEFORE INSERT OR UPDATE OF facility_id ON medicine_stock
  FOR EACH ROW EXECUTE FUNCTION require_health_facility();
--> statement-breakpoint
CREATE TRIGGER medicine_disposal_requests_health_facility
  BEFORE INSERT OR UPDATE OF facility_id ON medicine_disposal_requests
  FOR EACH ROW EXECUTE FUNCTION require_health_facility();
--> statement-breakpoint
CREATE TRIGGER medicine_stock_set_updated_at BEFORE UPDATE ON medicine_stock FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER medicine_disposal_requests_set_updated_at BEFORE UPDATE ON medicine_disposal_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Expiry alert thresholds (CLAUDE.md §7, §12), editable on Admin → Settings.
INSERT INTO settings (key, value) VALUES ('expiry_alert_days', '[90, 30, 7]'::jsonb) ON CONFLICT (key) DO NOTHING;
