-- Imports often refresh provenance/metadata without changing formula inputs.
-- Keep ownership enforcement ahead of the no-op checks.
CREATE OR REPLACE FUNCTION public.invalidate_composition_inputs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid; old_at timestamptz; new_at timestamptz;
BEGIN
 IF TG_TABLE_NAME = 'users' THEN
  IF TG_OP = 'UPDATE' AND ROW(OLD.height_cm,OLD.sex,OLD.date_of_birth) IS NOT DISTINCT FROM ROW(NEW.height_cm,NEW.sex,NEW.date_of_birth) THEN RETURN NEW; END IF;
  owner_id := NEW.id;
 ELSE
  IF TG_OP <> 'INSERT' THEN owner_id := OLD.user_id; old_at := OLD.measured_at; END IF;
  IF TG_OP <> 'DELETE' THEN owner_id := NEW.user_id; new_at := NEW.measured_at; END IF;
  IF TG_OP = 'UPDATE' THEN
   IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'INPUT_OWNER_IMMUTABLE' USING ERRCODE = '42501'; END IF;
   IF TG_TABLE_NAME = 'weight_logs' THEN
    IF ROW(OLD.weight_kg,OLD.measured_at) IS NOT DISTINCT FROM ROW(NEW.weight_kg,NEW.measured_at) THEN RETURN NEW; END IF;
   ELSIF TG_TABLE_NAME = 'body_measurements' THEN
    IF ROW(OLD.measurement_type,OLD.value_cm,OLD.measurement_protocol,OLD.measured_at)
       IS NOT DISTINCT FROM ROW(NEW.measurement_type,NEW.value_cm,NEW.measurement_protocol,NEW.measured_at) THEN RETURN NEW; END IF;
   END IF;
  END IF;
 END IF;
 INSERT INTO public.body_composition_input_revisions(user_id,revision) VALUES(owner_id,1)
 ON CONFLICT(user_id) DO UPDATE SET revision = body_composition_input_revisions.revision + 1;
 UPDATE public.body_composition_logs SET calculation_status = 'stale',
 bmi = NULL, bodyfat_percent = NULL, bodyfat_method = NULL, bodyfat_precision_level = NULL, bodyfat_formula = NULL, bodyfat_inputs = '[]',
 muscle_mass_kg = NULL, muscle_percent = NULL, muscle_method = NULL, muscle_precision_level = NULL, muscle_formula = NULL, muscle_inputs = '[]',
 waist_to_height_ratio = NULL, waist_to_height_category = NULL, waist_to_height_formula = NULL, waist_to_height_inputs = '[]',
 waist_to_hip_ratio = NULL, waist_to_hip_category = NULL, waist_to_hip_formula = NULL, waist_to_hip_inputs = '[]', updated_at = now()
 WHERE user_id = owner_id AND (TG_TABLE_NAME = 'users'
 OR calculated_for_date BETWEEN (old_at AT TIME ZONE 'UTC')::date - 1 AND ((old_at + interval '72 hours') AT TIME ZONE 'UTC')::date + 1
 OR calculated_for_date BETWEEN (new_at AT TIME ZONE 'UTC')::date - 1 AND ((new_at + interval '72 hours') AT TIME ZONE 'UTC')::date + 1);
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_composition_inputs() FROM PUBLIC;
