CREATE TYPE "public"."certificate_status" AS ENUM('PENDING', 'ISSUED', 'FAILED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."collection_method" AS ENUM('OTP', 'IN_APP', 'OVERRIDE');--> statement-breakpoint
CREATE TYPE "public"."container_status" AS ENUM('LABELLED', 'SCANNED_AT_PICKUP', 'COLLECTED', 'RECEIVED', 'MISSING', 'REFUSED', 'DESTROYED');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('ACTIVE', 'EXPIRING_SOON', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."driver_status" AS ENUM('ON_DUTY', 'ON_TRIP', 'OFF_DUTY');--> statement-breakpoint
CREATE TYPE "public"."handover_status" AS ENUM('SCANNED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'ISSUED', 'SETTLED_OFFLINE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."license_subject" AS ENUM('VEHICLE', 'DRIVER', 'FACILITY', 'SITE');--> statement-breakpoint
CREATE TYPE "public"."otp_status" AS ENUM('ISSUED', 'VERIFIED', 'EXPIRED', 'LOCKED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."outbox_channel" AS ENUM('SMS', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."stop_status" AS ENUM('PENDING', 'ARRIVED', 'COLLECTED', 'COLLECTED_OVERRIDE', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('ACTIVE', 'IN_TRANSIT', 'MAINTENANCE', 'OFFLINE');--> statement-breakpoint
CREATE TYPE "public"."waste_status" AS ENUM('REGISTERED', 'SCHEDULED', 'IN_TRANSIT', 'RECEIVED', 'DISPOSED', 'DISPOSED_WITH_EXCEPTION', 'CLOSED_NO_DESTRUCTION', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "destruction_methods" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destruction_methods_code_format" CHECK ("destruction_methods"."code" ~ '^[A-Z][A-Z_]{1,47}$')
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key_format" CHECK ("settings"."key" ~ '^[a-z][a-z0-9_]{1,63}$')
);
--> statement-breakpoint
CREATE TABLE "waste_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"colour_code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waste_categories_code_format" CHECK ("waste_categories"."code" ~ '^[A-Z][A-Z_]{1,31}$'),
	CONSTRAINT "waste_categories_colour_code" CHECK ("waste_categories"."colour_code" IN ('YELLOW', 'RED', 'BLUE', 'BROWN', 'BLACK', 'WHITE'))
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"license_no" text NOT NULL,
	"default_vehicle_id" uuid,
	"status" "driver_status" DEFAULT 'OFF_DUTY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_license_no_filled" CHECK (("drivers"."license_no" IS NOT NULL AND btrim("drivers"."license_no") <> ''))
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_type" "license_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"issued_on" date,
	"expires_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licenses_kind_filled" CHECK (("licenses"."kind" IS NOT NULL AND btrim("licenses"."kind") <> '')),
	CONSTRAINT "licenses_number_filled" CHECK (("licenses"."number" IS NOT NULL AND btrim("licenses"."number") <> '')),
	CONSTRAINT "licenses_dates_order" CHECK ("licenses"."issued_on" IS NULL OR "licenses"."expires_on" >= "licenses"."issued_on")
);
--> statement-breakpoint
CREATE TABLE "tracker_devices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"device_id" text NOT NULL,
	"vehicle_id" uuid,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracker_devices_token_hash_format" CHECK ("tracker_devices"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"plate_no" text NOT NULL,
	"model" text,
	"capacity_kg" numeric(10, 2) NOT NULL,
	"status" "vehicle_status" DEFAULT 'ACTIVE' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_plate_no_filled" CHECK (("vehicles"."plate_no" IS NOT NULL AND btrim("vehicles"."plate_no") <> '')),
	CONSTRAINT "vehicles_capacity_positive" CHECK ("vehicles"."capacity_kg" > 0)
);
--> statement-breakpoint
CREATE TABLE "containers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"container_code" text NOT NULL,
	"waste_record_id" uuid NOT NULL,
	"seq_no" integer NOT NULL,
	"status" "container_status" DEFAULT 'LABELLED' NOT NULL,
	"exception_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "containers_waste_record_seq_unique" UNIQUE("waste_record_id","seq_no"),
	CONSTRAINT "containers_code_format" CHECK ("containers"."container_code" ~ '^WR-[0-9]{4}-[0-9]{5}-C[0-9]{2,3}$'),
	CONSTRAINT "containers_seq_no_min" CHECK ("containers"."seq_no" >= 1),
	CONSTRAINT "containers_exception_reason" CHECK (("containers"."status" IN ('MISSING', 'REFUSED')) = ("containers"."exception_reason" IS NOT NULL AND btrim("containers"."exception_reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "waste_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"waste_code" text NOT NULL,
	"facility_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"container_count" integer NOT NULL,
	"weight_kg" numeric(10, 2) NOT NULL,
	"status" "waste_status" DEFAULT 'REGISTERED' NOT NULL,
	"registered_by" uuid NOT NULL,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waste_records_code_format" CHECK ("waste_records"."waste_code" ~ '^WR-[0-9]{4}-[0-9]{5}$'),
	CONSTRAINT "waste_records_container_count_min" CHECK ("waste_records"."container_count" >= 1),
	CONSTRAINT "waste_records_weight_positive" CHECK ("waste_records"."weight_kg" > 0),
	CONSTRAINT "waste_records_cancel_reason" CHECK (("waste_records"."status" = 'CANCELLED') = (("waste_records"."cancel_reason" IS NOT NULL AND btrim("waste_records"."cancel_reason") <> '') AND "waste_records"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "trip_stop_waste" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_stop_id" uuid NOT NULL,
	"waste_record_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_stop_waste_stop_waste_unique" UNIQUE("trip_stop_id","waste_record_id")
);
--> statement-breakpoint
CREATE TABLE "trip_stops" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"priority_order" integer NOT NULL,
	"status" "stop_status" DEFAULT 'PENDING' NOT NULL,
	"collection_method" "collection_method",
	"confirmed_by" uuid,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"arrival_distance_m" integer,
	"geofence_ok" boolean,
	"override_reason" text,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_stops_trip_order_unique" UNIQUE("trip_id","priority_order"),
	CONSTRAINT "trip_stops_trip_facility_unique" UNIQUE("trip_id","facility_id"),
	CONSTRAINT "trip_stops_priority_min" CHECK ("trip_stops"."priority_order" >= 1),
	CONSTRAINT "trip_stops_distance_min" CHECK ("trip_stops"."arrival_distance_m" IS NULL OR "trip_stops"."arrival_distance_m" >= 0),
	CONSTRAINT "trip_stops_collection_fields" CHECK (("trip_stops"."status" IN ('COLLECTED', 'COLLECTED_OVERRIDE')) =
          ("trip_stops"."collection_method" IS NOT NULL AND "trip_stops"."completed_at" IS NOT NULL AND "trip_stops"."confirmed_by" IS NOT NULL)),
	CONSTRAINT "trip_stops_override" CHECK (("trip_stops"."status" = 'COLLECTED_OVERRIDE') =
          ("trip_stops"."collection_method" IS NOT NULL AND "trip_stops"."collection_method" = 'OVERRIDE' AND ("trip_stops"."override_reason" IS NOT NULL AND btrim("trip_stops"."override_reason") <> ''))),
	CONSTRAINT "trip_stops_collected_method" CHECK ("trip_stops"."status" <> 'COLLECTED' OR "trip_stops"."collection_method" IN ('OTP', 'IN_APP')),
	CONSTRAINT "trip_stops_skip_reason" CHECK (("trip_stops"."status" = 'SKIPPED') = ("trip_stops"."skip_reason" IS NOT NULL AND btrim("trip_stops"."skip_reason") <> '')),
	CONSTRAINT "trip_stops_arrived_at" CHECK ("trip_stops"."status" NOT IN ('ARRIVED', 'COLLECTED', 'COLLECTED_OVERRIDE') OR "trip_stops"."arrived_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_code" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"planned_date" date NOT NULL,
	"status" "trip_status" DEFAULT 'PLANNED' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_code_format" CHECK ("trips"."trip_code" ~ '^TR-[0-9]{6}-[0-9]{2}$'),
	CONSTRAINT "trips_cancel_reason" CHECK (("trips"."status" = 'CANCELLED') = (("trips"."cancel_reason" IS NOT NULL AND btrim("trips"."cancel_reason") <> '') AND "trips"."cancelled_at" IS NOT NULL)),
	CONSTRAINT "trips_started_at" CHECK ("trips"."status" NOT IN ('IN_PROGRESS', 'COMPLETED') OR "trips"."started_at" IS NOT NULL),
	CONSTRAINT "trips_completed_at" CHECK (("trips"."status" = 'COMPLETED') = ("trips"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "handovers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_stop_id" uuid NOT NULL,
	"container_id" uuid NOT NULL,
	"otp_id" uuid,
	"driver_id" uuid NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "handover_status" DEFAULT 'SCANNED' NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handovers_stop_container_unique" UNIQUE("trip_stop_id","container_id")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_stop_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"recipient_count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"status" "otp_status" DEFAULT 'ISSUED' NOT NULL,
	"verified_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_codes_hash_filled" CHECK (length("otp_codes"."code_hash") >= 32),
	CONSTRAINT "otp_codes_recipients_min" CHECK ("otp_codes"."recipient_count" >= 1),
	CONSTRAINT "otp_codes_attempts_min" CHECK ("otp_codes"."attempts" >= 0),
	CONSTRAINT "otp_codes_verified_at" CHECK (("otp_codes"."status" = 'VERIFIED') = ("otp_codes"."verified_at" IS NOT NULL)),
	CONSTRAINT "otp_codes_cancelled_at" CHECK (("otp_codes"."status" = 'CANCELLED') = ("otp_codes"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "gps_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"device_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"trip_id" uuid,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed_kmh" real,
	"heading" real,
	"recorded_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gps_events_device_recorded_unique" UNIQUE("device_id","recorded_at"),
	CONSTRAINT "gps_events_lat_range" CHECK ("gps_events"."lat" BETWEEN -90 AND 90),
	CONSTRAINT "gps_events_lng_range" CHECK ("gps_events"."lng" BETWEEN -180 AND 180),
	CONSTRAINT "gps_events_speed_min" CHECK ("gps_events"."speed_kmh" IS NULL OR "gps_events"."speed_kmh" >= 0),
	CONSTRAINT "gps_events_heading_range" CHECK ("gps_events"."heading" IS NULL OR ("gps_events"."heading" >= 0 AND "gps_events"."heading" < 360))
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"certificate_no" text NOT NULL,
	"disposal_record_id" uuid NOT NULL,
	"file_key" text,
	"sha256" text,
	"verify_token" text NOT NULL,
	"status" "certificate_status" DEFAULT 'PENDING' NOT NULL,
	"issued_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"generation_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_no_format" CHECK ("certificates"."certificate_no" ~ '^CD-[0-9]{4}-[0-9]{5}$'),
	CONSTRAINT "certificates_verify_token_format" CHECK ("certificates"."verify_token" ~ '^[A-Za-z0-9_-]{22,100}$'),
	CONSTRAINT "certificates_sha256_format" CHECK ("certificates"."sha256" IS NULL OR "certificates"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "certificates_issued_fields" CHECK ("certificates"."status" NOT IN ('ISSUED', 'REVOKED')
          OR ("certificates"."file_key" IS NOT NULL AND "certificates"."sha256" IS NOT NULL AND "certificates"."issued_at" IS NOT NULL)),
	CONSTRAINT "certificates_revoked_fields" CHECK (("certificates"."status" = 'REVOKED') = (("certificates"."revoked_reason" IS NOT NULL AND btrim("certificates"."revoked_reason") <> '') AND "certificates"."revoked_at" IS NOT NULL)),
	CONSTRAINT "certificates_attempts_min" CHECK ("certificates"."generation_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "disposal_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"waste_record_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"received_at" timestamp with time zone,
	"method_id" uuid,
	"destroyed_at" timestamp with time zone,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disposal_records_destruction_fields" CHECK (("disposal_records"."destroyed_at" IS NOT NULL) = ("disposal_records"."method_id" IS NOT NULL)),
	CONSTRAINT "disposal_records_locked_needs_destruction" CHECK (NOT "disposal_records"."locked" OR "disposal_records"."destroyed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"contract_code" text NOT NULL,
	"facility_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"monthly_fee_santim" bigint NOT NULL,
	"terms" text,
	"status" "contract_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_code_format" CHECK ("contracts"."contract_code" ~ '^CT-[0-9]{4}-[0-9]{4}$'),
	CONSTRAINT "contracts_dates_order" CHECK ("contracts"."end_date" > "contracts"."start_date"),
	CONSTRAINT "contracts_fee_min" CHECK ("contracts"."monthly_fee_santim" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"invoice_no" text NOT NULL,
	"contract_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"subtotal_santim" bigint NOT NULL,
	"vat_rate_percent" numeric(5, 2) NOT NULL,
	"vat_santim" bigint NOT NULL,
	"total_santim" bigint NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_date" date,
	"settled_at" timestamp with time zone,
	"settlement_ref" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_contract_period_unique" UNIQUE("contract_id","period_start"),
	CONSTRAINT "invoices_no_format" CHECK ("invoices"."invoice_no" ~ '^INV-[0-9]{4}-[0-9]{2}-[0-9]{4}$'),
	CONSTRAINT "invoices_period_order" CHECK ("invoices"."period_end" >= "invoices"."period_start"),
	CONSTRAINT "invoices_money_min" CHECK ("invoices"."subtotal_santim" >= 0 AND "invoices"."vat_santim" >= 0 AND "invoices"."total_santim" >= 0),
	CONSTRAINT "invoices_total_sum" CHECK ("invoices"."total_santim" = "invoices"."subtotal_santim" + "invoices"."vat_santim"),
	CONSTRAINT "invoices_vat_rate_range" CHECK ("invoices"."vat_rate_percent" BETWEEN 0 AND 100),
	CONSTRAINT "invoices_issued_fields" CHECK ("invoices"."status" NOT IN ('ISSUED', 'SETTLED_OFFLINE')
          OR ("invoices"."issued_at" IS NOT NULL AND "invoices"."due_date" IS NOT NULL)),
	CONSTRAINT "invoices_settled_fields" CHECK (("invoices"."status" = 'SETTLED_OFFLINE') = ("invoices"."settled_at" IS NOT NULL AND ("invoices"."settlement_ref" IS NOT NULL AND btrim("invoices"."settlement_ref") <> ''))),
	CONSTRAINT "invoices_cancel_reason" CHECK (("invoices"."status" = 'CANCELLED') = ("invoices"."cancelled_at" IS NOT NULL AND ("invoices"."cancel_reason" IS NOT NULL AND btrim("invoices"."cancel_reason") <> '')))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_user_id" uuid,
	"role" "user_role",
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"request_id" text,
	"prev_hash" text,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_action_format" CHECK ("audit_logs"."action" ~ '^[a-z][a-z0-9_.]{1,63}$'),
	CONSTRAINT "audit_logs_hash_format" CHECK ("audit_logs"."hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "audit_logs_prev_hash_format" CHECK ("audit_logs"."prev_hash" IS NULL OR "audit_logs"."prev_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"user_id" uuid,
	"route" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_route_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","route","key"),
	CONSTRAINT "idempotency_keys_key_format" CHECK ("idempotency_keys"."key" ~ '^[A-Za-z0-9_-]{8,128}$'),
	CONSTRAINT "idempotency_keys_status_range" CHECK ("idempotency_keys"."response_status" IS NULL OR "idempotency_keys"."response_status" BETWEEN 100 AND 599)
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"channel" "outbox_channel" NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_error" text,
	"provider_ref" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_messages_attempts_min" CHECK ("outbox_messages"."attempts" >= 0),
	CONSTRAINT "outbox_messages_sent_at" CHECK (("outbox_messages"."status" = 'SENT') = ("outbox_messages"."sent_at" IS NOT NULL)),
	CONSTRAINT "outbox_messages_template_format" CHECK ("outbox_messages"."template" ~ '^[a-z][a-z0-9_.]{1,63}$')
);
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_default_vehicle_id_vehicles_id_fk" FOREIGN KEY ("default_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_devices" ADD CONSTRAINT "tracker_devices_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_waste_record_id_waste_records_id_fk" FOREIGN KEY ("waste_record_id") REFERENCES "public"."waste_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_category_id_waste_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."waste_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stop_waste" ADD CONSTRAINT "trip_stop_waste_trip_stop_id_trip_stops_id_fk" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stop_waste" ADD CONSTRAINT "trip_stop_waste_waste_record_id_waste_records_id_fk" FOREIGN KEY ("waste_record_id") REFERENCES "public"."waste_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_trip_stop_id_trip_stops_id_fk" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_otp_id_otp_codes_id_fk" FOREIGN KEY ("otp_id") REFERENCES "public"."otp_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_trip_stop_id_trip_stops_id_fk" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_events" ADD CONSTRAINT "gps_events_device_id_tracker_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."tracker_devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_events" ADD CONSTRAINT "gps_events_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_events" ADD CONSTRAINT "gps_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_disposal_record_id_disposal_records_id_fk" FOREIGN KEY ("disposal_record_id") REFERENCES "public"."disposal_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposal_records" ADD CONSTRAINT "disposal_records_waste_record_id_waste_records_id_fk" FOREIGN KEY ("waste_record_id") REFERENCES "public"."waste_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposal_records" ADD CONSTRAINT "disposal_records_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposal_records" ADD CONSTRAINT "disposal_records_method_id_destruction_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."destruction_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "destruction_methods_code_unique" ON "destruction_methods" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_key_unique" ON "settings" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "waste_categories_code_unique" ON "waste_categories" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_user_id_unique" ON "drivers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_license_no_unique" ON "drivers" USING btree ("license_no");--> statement-breakpoint
CREATE INDEX "licenses_subject_idx" ON "licenses" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "licenses_expires_on_idx" ON "licenses" USING btree ("expires_on");--> statement-breakpoint
CREATE UNIQUE INDEX "tracker_devices_device_id_unique" ON "tracker_devices" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracker_devices_vehicle_id_unique" ON "tracker_devices" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_plate_no_unique" ON "vehicles" USING btree ("plate_no");--> statement-breakpoint
CREATE UNIQUE INDEX "containers_container_code_unique" ON "containers" USING btree ("container_code");--> statement-breakpoint
CREATE INDEX "containers_status_idx" ON "containers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "waste_records_waste_code_unique" ON "waste_records" USING btree ("waste_code");--> statement-breakpoint
CREATE INDEX "waste_records_facility_status_created_idx" ON "waste_records" USING btree ("facility_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_stop_waste_one_active_stop" ON "trip_stop_waste" USING btree ("waste_record_id") WHERE "trip_stop_waste"."active";--> statement-breakpoint
CREATE INDEX "trip_stops_trip_order_idx" ON "trip_stops" USING btree ("trip_id","priority_order");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_trip_code_unique" ON "trips" USING btree ("trip_code");--> statement-breakpoint
CREATE INDEX "trips_planned_date_status_idx" ON "trips" USING btree ("planned_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_one_active_per_vehicle" ON "trips" USING btree ("vehicle_id") WHERE "trips"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE UNIQUE INDEX "trips_one_active_per_driver" ON "trips" USING btree ("driver_id") WHERE "trips"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE INDEX "otp_codes_trip_stop_idx" ON "otp_codes" USING btree ("trip_stop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "otp_codes_one_issued_per_stop" ON "otp_codes" USING btree ("trip_stop_id") WHERE "otp_codes"."status" = 'ISSUED';--> statement-breakpoint
CREATE INDEX "gps_events_vehicle_recorded_idx" ON "gps_events" USING btree ("vehicle_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gps_events_trip_idx" ON "gps_events" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_certificate_no_unique" ON "certificates" USING btree ("certificate_no");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_verify_token_unique" ON "certificates" USING btree ("verify_token");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_one_current_per_disposal" ON "certificates" USING btree ("disposal_record_id") WHERE "certificates"."status" <> 'REVOKED';--> statement-breakpoint
CREATE UNIQUE INDEX "disposal_records_waste_record_unique" ON "disposal_records" USING btree ("waste_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_contract_code_unique" ON "contracts" USING btree ("contract_code");--> statement-breakpoint
CREATE INDEX "contracts_facility_status_idx" ON "contracts" USING btree ("facility_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_no_unique" ON "invoices" USING btree ("invoice_no");--> statement-breakpoint
CREATE INDEX "invoices_facility_status_idx" ON "invoices" USING btree ("facility_id","status");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_logs_hash_unique" ON "audit_logs" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_status_next_idx" ON "outbox_messages" USING btree ("status","next_attempt_at");