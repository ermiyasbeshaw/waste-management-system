CREATE TABLE "code_sequences" (
	"scope" text NOT NULL,
	"period" text NOT NULL,
	"last_value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_sequences_pkey" PRIMARY KEY("scope","period"),
	CONSTRAINT "code_sequences_scope" CHECK ("code_sequences"."scope" IN ('waste', 'trip', 'certificate', 'invoice', 'contract')),
	CONSTRAINT "code_sequences_period_format" CHECK ("code_sequences"."period" ~ '^[0-9]{4}(-?[0-9]{2}){0,2}$'),
	CONSTRAINT "code_sequences_last_value_min" CHECK ("code_sequences"."last_value" >= 1)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
CREATE UNIQUE INDEX "audit_logs_seq_unique" ON "audit_logs" USING btree ("seq");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_prev_hash_unique" UNIQUE NULLS NOT DISTINCT("prev_hash");--> statement-breakpoint
CREATE TRIGGER code_sequences_set_updated_at BEFORE UPDATE ON code_sequences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
