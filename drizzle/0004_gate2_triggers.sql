-- Custom SQL migration (Gate 2.1): rules that a CHECK constraint cannot express.
-- Every violation raises check_violation with a CONSTRAINT name, so services and tests can tell them apart.

-- 1) Audit log is INSERT-only (CLAUDE.md §6): no UPDATE, DELETE or TRUNCATE, ever.
CREATE OR REPLACE FUNCTION audit_logs_block_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'audit_logs_append_only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_change();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_change();
--> statement-breakpoint

-- 2) A locked disposal record cannot be changed or deleted (CLAUDE.md §9). Locking itself is allowed.
CREATE OR REPLACE FUNCTION disposal_records_guard_locked() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked THEN
    RAISE EXCEPTION 'disposal record % is locked', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'disposal_records_locked';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER disposal_records_locked_guard
  BEFORE UPDATE OR DELETE ON disposal_records
  FOR EACH ROW EXECUTE FUNCTION disposal_records_guard_locked();
--> statement-breakpoint

-- 3) Role checks across tables.
CREATE OR REPLACE FUNCTION require_user_role(p_user uuid, p_role user_role, p_constraint text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user AND role = p_role) THEN
    RAISE EXCEPTION 'user % must have role %', p_user, p_role
      USING ERRCODE = 'check_violation', CONSTRAINT = p_constraint;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION drivers_require_driver_role() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_user_role(NEW.user_id, 'driver', 'drivers_user_is_driver');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER drivers_user_is_driver
  BEFORE INSERT OR UPDATE OF user_id ON drivers
  FOR EACH ROW EXECUTE FUNCTION drivers_require_driver_role();
--> statement-breakpoint
-- A user with a driver profile keeps the driver role while the profile exists.
CREATE OR REPLACE FUNCTION users_keep_driver_role() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'driver' AND NEW.role IS DISTINCT FROM 'driver'
     AND EXISTS (SELECT 1 FROM drivers WHERE user_id = NEW.id) THEN
    RAISE EXCEPTION 'user % has a driver profile and must keep the driver role', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'drivers_user_is_driver';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_keep_driver_role
  BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION users_keep_driver_role();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION disposal_records_require_operator() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_user_role(NEW.operator_id, 'disposal_operator', 'disposal_records_operator_role');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER disposal_records_operator_role
  BEFORE INSERT OR UPDATE OF operator_id ON disposal_records
  FOR EACH ROW EXECUTE FUNCTION disposal_records_require_operator();
--> statement-breakpoint

-- 4) Waste and pickups happen at health facilities, never at the DISPOSAL_SITE.
CREATE OR REPLACE FUNCTION require_health_facility() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM facilities WHERE id = NEW.facility_id AND type = 'DISPOSAL_SITE') THEN
    RAISE EXCEPTION '% cannot belong to the disposal site', TG_TABLE_NAME
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_health_facility';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER waste_records_health_facility
  BEFORE INSERT OR UPDATE OF facility_id ON waste_records
  FOR EACH ROW EXECUTE FUNCTION require_health_facility();
--> statement-breakpoint
CREATE TRIGGER trip_stops_health_facility
  BEFORE INSERT OR UPDATE OF facility_id ON trip_stops
  FOR EACH ROW EXECUTE FUNCTION require_health_facility();
--> statement-breakpoint

-- 5) Container code = waste code + "-C" + seq (2 digits, 3 from 100) and seq ≤ container_count.
CREATE OR REPLACE FUNCTION containers_match_waste() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  w_code text;
  w_count integer;
  expected text;
BEGIN
  SELECT waste_code, container_count INTO w_code, w_count FROM waste_records WHERE id = NEW.waste_record_id;
  IF NEW.seq_no > w_count THEN
    RAISE EXCEPTION 'container % is beyond the % containers of %', NEW.seq_no, w_count, w_code
      USING ERRCODE = 'check_violation', CONSTRAINT = 'containers_seq_within_count';
  END IF;
  -- Computed first: inside IF … THEN, a CASE … THEN would end the condition early.
  expected := w_code || '-C' || (CASE WHEN NEW.seq_no < 100 THEN lpad(NEW.seq_no::text, 2, '0') ELSE NEW.seq_no::text END);
  IF NEW.container_code IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'container code % does not match waste % / seq %', NEW.container_code, w_code, NEW.seq_no
      USING ERRCODE = 'check_violation', CONSTRAINT = 'containers_code_matches_waste';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER containers_match_waste
  BEFORE INSERT OR UPDATE OF container_code, seq_no, waste_record_id ON containers
  FOR EACH ROW EXECUTE FUNCTION containers_match_waste();
--> statement-breakpoint

-- 6) An invoice belongs to the facility of its contract.
CREATE OR REPLACE FUNCTION invoices_match_contract() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM contracts WHERE id = NEW.contract_id AND facility_id = NEW.facility_id) THEN
    RAISE EXCEPTION 'invoice facility must be the contract facility'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoices_facility_matches_contract';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoices_match_contract
  BEFORE INSERT OR UPDATE OF contract_id, facility_id ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_match_contract();
--> statement-breakpoint

-- 7) Contracts of one facility may not overlap in time ("one active contract per facility per period").
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE contracts ADD CONSTRAINT contracts_no_overlap
  EXCLUDE USING gist (facility_id WITH =, daterange(start_date, end_date, '[)') WITH &&);
--> statement-breakpoint

-- 8) updated_at maintained by the database (function set_updated_at() from migration 0001).
CREATE TRIGGER waste_categories_set_updated_at BEFORE UPDATE ON waste_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER destruction_methods_set_updated_at BEFORE UPDATE ON destruction_methods FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER settings_set_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER vehicles_set_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER drivers_set_updated_at BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER tracker_devices_set_updated_at BEFORE UPDATE ON tracker_devices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER licenses_set_updated_at BEFORE UPDATE ON licenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER waste_records_set_updated_at BEFORE UPDATE ON waste_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER containers_set_updated_at BEFORE UPDATE ON containers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trips_set_updated_at BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trip_stops_set_updated_at BEFORE UPDATE ON trip_stops FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trip_stop_waste_set_updated_at BEFORE UPDATE ON trip_stop_waste FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER otp_codes_set_updated_at BEFORE UPDATE ON otp_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER handovers_set_updated_at BEFORE UPDATE ON handovers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER disposal_records_set_updated_at BEFORE UPDATE ON disposal_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER certificates_set_updated_at BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER contracts_set_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER outbox_messages_set_updated_at BEFORE UPDATE ON outbox_messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
