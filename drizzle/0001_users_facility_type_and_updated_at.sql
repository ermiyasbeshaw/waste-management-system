-- Custom SQL migration (Gate 1b.3).
-- 1) A user's facility must match the role (CHECK constraints cannot look at another table):
--    disposal_operator → a DISPOSAL_SITE facility (DECISION v1.2 addendum);
--    hospital_admin / hospital_staff → any facility that is NOT a DISPOSAL_SITE.
-- 2) updated_at is maintained by the database on every UPDATE.

CREATE OR REPLACE FUNCTION enforce_user_facility_type() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ftype facility_type;
BEGIN
  IF NEW.facility_id IS NULL OR NEW.role IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT type INTO ftype FROM facilities WHERE id = NEW.facility_id;
  IF NEW.role = 'disposal_operator' AND ftype <> 'DISPOSAL_SITE' THEN
    RAISE EXCEPTION 'disposal_operator must belong to a DISPOSAL_SITE facility'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'users_facility_type_by_role';
  END IF;
  IF NEW.role IN ('hospital_admin', 'hospital_staff') AND ftype = 'DISPOSAL_SITE' THEN
    RAISE EXCEPTION 'hospital roles cannot belong to a DISPOSAL_SITE facility'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'users_facility_type_by_role';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_facility_type_by_role
  BEFORE INSERT OR UPDATE OF role, facility_id ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_user_facility_type();
--> statement-breakpoint
-- A facility that has users cannot be turned into (or out of) a DISPOSAL_SITE behind their back.
CREATE OR REPLACE FUNCTION enforce_facility_type_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type IS DISTINCT FROM OLD.type AND EXISTS (SELECT 1 FROM users WHERE facility_id = NEW.id) THEN
    RAISE EXCEPTION 'facility type cannot change while users belong to the facility'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'facilities_type_locked_with_users';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER facilities_type_locked_with_users
  BEFORE UPDATE OF type ON facilities
  FOR EACH ROW EXECUTE FUNCTION enforce_facility_type_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER facilities_set_updated_at BEFORE UPDATE ON facilities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
