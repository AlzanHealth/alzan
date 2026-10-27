BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_timed_exercise_id uuid;
  v_reps_exercise_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_timed_set_id uuid := gen_random_uuid();
  v_reps_set_id uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  SELECT e.id INTO v_timed_exercise_id
  FROM public.exercises e JOIN public.exercise_types t ON t.id = e.exercise_type_id
  WHERE t.code = 'Tiempo' LIMIT 1;
  SELECT e.id INTO v_reps_exercise_id
  FROM public.exercises e JOIN public.exercise_types t ON t.id = e.exercise_type_id
  WHERE t.code = 'Repeticiones' LIMIT 1;
  IF v_user_id IS NULL OR v_timed_exercise_id IS NULL OR v_reps_exercise_id IS NULL THEN
    RAISE EXCEPTION 'TIMED_WORKOUT_TEST_REQUIRES_LOCAL_SEED';
  END IF;

  INSERT INTO public.activity_sessions (id, user_id, sport_type, name)
  VALUES (v_session_id, v_user_id, 'strength', 'Timed workout persistence regression');

  INSERT INTO public.workout_sets (id, session_id, user_id, exercise_id, set_number, reps, duration_s)
  VALUES
    (v_timed_set_id, v_session_id, v_user_id, v_timed_exercise_id, 1, NULL, 40),
    (v_reps_set_id, v_session_id, v_user_id, v_reps_exercise_id, 1, 8, NULL);

  IF NOT EXISTS (
    SELECT 1 FROM public.workout_sets
    WHERE id = v_timed_set_id AND reps IS NULL AND duration_s = 40 AND rpe IS NULL
  ) THEN
    RAISE EXCEPTION 'TIMED_WORKOUT_SET_SECONDS_NOT_PRESERVED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workout_sets
    WHERE id = v_reps_set_id AND reps = 8 AND duration_s IS NULL AND rpe IS NULL
  ) THEN
    RAISE EXCEPTION 'REPETITION_WORKOUT_SET_CHANGED';
  END IF;
END;
$$;

ROLLBACK;
