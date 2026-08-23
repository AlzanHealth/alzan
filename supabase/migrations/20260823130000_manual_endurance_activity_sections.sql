CREATE TABLE public.activity_session_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  parent_section_id uuid REFERENCES public.activity_session_sections(id) ON DELETE CASCADE,
  source_template_step_id uuid REFERENCES public.endurance_workout_steps(id) ON DELETE SET NULL,
  order_index integer NOT NULL CHECK (order_index >= 0),
  is_group boolean NOT NULL DEFAULT false,
  phase_type public.phase_type_enum NOT NULL,
  duration_type public.duration_type_enum NOT NULL,
  label text,
  repetitions integer NOT NULL DEFAULT 1 CHECK (repetitions >= 1),
  repetition_index integer CHECK (repetition_index IS NULL OR repetition_index >= 1),
  distance_m numeric CHECK (distance_m IS NULL OR distance_m >= 0),
  duration_s integer CHECK (duration_s IS NULL OR duration_s >= 0),
  pace_s_per_km numeric CHECK (pace_s_per_km IS NULL OR pace_s_per_km >= 0),
  pace_s_per_100m numeric CHECK (pace_s_per_100m IS NULL OR pace_s_per_100m >= 0),
  speed_m_per_s numeric CHECK (speed_m_per_s IS NULL OR speed_m_per_s >= 0),
  avg_heart_rate integer CHECK (avg_heart_rate IS NULL OR avg_heart_rate >= 0),
  max_heart_rate integer CHECK (max_heart_rate IS NULL OR max_heart_rate >= 0),
  avg_power_w integer CHECK (avg_power_w IS NULL OR avg_power_w >= 0),
  max_power_w integer CHECK (max_power_w IS NULL OR max_power_w >= 0),
  avg_cadence integer CHECK (avg_cadence IS NULL OR avg_cadence >= 0),
  elev_gain_m numeric CHECK (elev_gain_m IS NULL OR elev_gain_m >= 0),
  calories_kcal numeric CHECK (calories_kcal IS NULL OR calories_kcal >= 0),
  rpe numeric CHECK (rpe IS NULL OR (rpe >= 0 AND rpe <= 10)),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_session_sections_group_metrics_check CHECK (
    NOT is_group OR (
      distance_m IS NULL AND duration_s IS NULL AND pace_s_per_km IS NULL AND pace_s_per_100m IS NULL
      AND speed_m_per_s IS NULL AND avg_heart_rate IS NULL AND max_heart_rate IS NULL
      AND avg_power_w IS NULL AND max_power_w IS NULL AND avg_cadence IS NULL
      AND elev_gain_m IS NULL AND calories_kcal IS NULL AND rpe IS NULL
    )
  )
);

CREATE INDEX activity_session_sections_session_order_idx
  ON public.activity_session_sections (session_id, order_index, repetition_index);

CREATE INDEX activity_session_sections_user_session_idx
  ON public.activity_session_sections (user_id, session_id);

ALTER TABLE public.activity_session_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity session sections"
  ON public.activity_session_sections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity session sections"
  ON public.activity_session_sections FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.activity_sessions session
      WHERE session.id = session_id
        AND session.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own activity session sections"
  ON public.activity_session_sections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.activity_sessions session
      WHERE session.id = session_id
        AND session.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own activity session sections"
  ON public.activity_session_sections FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.create_manual_endurance_activity(
  p_session jsonb,
  p_sections jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session_id uuid := gen_random_uuid();
  v_item jsonb;
  v_client_id text;
  v_parent_client_id text;
  v_parent_id uuid;
  v_section_id uuid;
  v_section_map jsonb := '{}'::jsonb;
  v_group_repetitions jsonb := '{}'::jsonb;
  v_sport_type text := p_session->>'sport_type';
  v_template_id uuid := NULLIF(p_session->>'endurance_template_id', '')::uuid;
  v_distance_m numeric := 0;
  v_duration_s integer := 0;
  v_has_distance boolean := false;
  v_has_duration boolean := false;
  v_is_group boolean;
  v_item_distance_m numeric;
  v_item_duration_s integer;
  v_item_multiplier integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_session) <> 'object' OR jsonb_typeof(p_sections) <> 'array' THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_INVALID_PAYLOAD';
  END IF;

  IF v_sport_type NOT IN ('running', 'cycling', 'swimming') THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_UNSUPPORTED_SPORT';
  END IF;

  IF NULLIF(p_session->>'name', '') IS NULL THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_NAME_REQUIRED';
  END IF;

  IF p_session->>'start_time' IS NULL THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_START_REQUIRED';
  END IF;

  IF v_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.endurance_workout_templates t
    WHERE t.id = v_template_id
      AND t.user_id = v_user_id
      AND t.sport_type::text = v_sport_type
  ) THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_TEMPLATE_NOT_FOUND';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_sections)
  LOOP
    v_client_id := NULLIF(v_item->>'clientId', '');
    IF v_client_id IS NULL THEN
      RAISE EXCEPTION 'MANUAL_ENDURANCE_SECTION_ID_REQUIRED';
    END IF;
    IF v_section_map ? v_client_id THEN
      RAISE EXCEPTION 'MANUAL_ENDURANCE_DUPLICATE_SECTION_ID';
    END IF;

    v_is_group := COALESCE((v_item->>'isGroup')::boolean, false);
    v_parent_client_id := NULLIF(v_item->>'parentClientId', '');
    v_parent_id := NULL;
    v_item_multiplier := 1;
    IF v_parent_client_id IS NOT NULL THEN
      v_parent_id := NULLIF(v_section_map->>v_parent_client_id, '')::uuid;
      IF v_parent_id IS NULL THEN
        RAISE EXCEPTION 'MANUAL_ENDURANCE_PARENT_NOT_FOUND';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.activity_session_sections parent_section
        WHERE parent_section.id = v_parent_id
          AND parent_section.is_group
      ) THEN
        RAISE EXCEPTION 'MANUAL_ENDURANCE_PARENT_NOT_GROUP';
      END IF;
      IF NULLIF(v_item->>'repetitionIndex', '') IS NULL THEN
        v_item_multiplier := greatest(1, COALESCE((v_group_repetitions->>v_parent_client_id)::integer, 1));
      END IF;
    END IF;

    IF NULLIF(v_item->>'sourceTemplateStepId', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.endurance_workout_steps step
      JOIN public.endurance_workout_templates template ON template.id = step.template_id
      WHERE step.id = (v_item->>'sourceTemplateStepId')::uuid
        AND v_template_id IS NOT NULL
        AND step.template_id = v_template_id
        AND template.user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'MANUAL_ENDURANCE_TEMPLATE_STEP_NOT_FOUND';
    END IF;

    v_item_distance_m := NULLIF(v_item->>'distanceM', '')::numeric;
    v_item_duration_s := NULLIF(v_item->>'durationS', '')::integer;

    IF NOT v_is_group THEN
      IF v_item_distance_m IS NOT NULL AND v_item_distance_m > 0 THEN
        v_has_distance := true;
      END IF;
      IF v_item_duration_s IS NOT NULL AND v_item_duration_s > 0 THEN
        v_has_duration := true;
      END IF;
    END IF;

    v_section_id := gen_random_uuid();
    INSERT INTO public.activity_session_sections (
      id, user_id, session_id, parent_section_id, source_template_step_id,
      order_index, is_group, phase_type, duration_type, label, repetitions,
      repetition_index, distance_m, duration_s, pace_s_per_km, pace_s_per_100m,
      speed_m_per_s, avg_heart_rate, max_heart_rate, avg_power_w, max_power_w,
      avg_cadence, elev_gain_m, calories_kcal, rpe, notes
    ) VALUES (
      v_section_id,
      v_user_id,
      v_session_id,
      v_parent_id,
      NULLIF(v_item->>'sourceTemplateStepId', '')::uuid,
      COALESCE((v_item->>'orderIndex')::integer, 0),
      v_is_group,
      (v_item->>'phaseType')::public.phase_type_enum,
      (v_item->>'durationType')::public.duration_type_enum,
      NULLIF(v_item->>'label', ''),
      greatest(1, COALESCE((v_item->>'repetitions')::integer, 1)),
      NULLIF(v_item->>'repetitionIndex', '')::integer,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'distanceM', '')::numeric END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'durationS', '')::integer END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'paceSPerKm', '')::numeric END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'paceSPer100m', '')::numeric END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'speedMPerS', '')::numeric END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'heartRateAvg', '')::integer END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'heartRateMax', '')::integer END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'powerAvgW', '')::integer END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'powerMaxW', '')::integer END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'cadenceAvg', '')::integer END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'elevationGainM', '')::numeric END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'caloriesKcal', '')::numeric END,
      CASE WHEN v_is_group THEN NULL ELSE NULLIF(v_item->>'rpe', '')::numeric END,
      NULLIF(v_item->>'notes', '')
    );

    v_section_map := v_section_map || jsonb_build_object(v_client_id, v_section_id::text);
    IF v_is_group THEN
      v_group_repetitions := v_group_repetitions || jsonb_build_object(
        v_client_id,
        greatest(1, COALESCE((v_item->>'repetitions')::integer, 1))
      );
    END IF;

    IF NOT v_is_group THEN
      IF NULLIF(v_item->>'distanceM', '')::numeric > 0 THEN
        v_distance_m := v_distance_m + (v_item_distance_m * v_item_multiplier);
      END IF;
      IF NULLIF(v_item->>'durationS', '')::integer > 0 THEN
        v_duration_s := v_duration_s + (v_item_duration_s * v_item_multiplier);
      END IF;
    END IF;
  END LOOP;

  IF NOT v_has_distance AND NOT v_has_duration THEN
    RAISE EXCEPTION 'MANUAL_ENDURANCE_EMPTY_ACTIVITY';
  END IF;

  INSERT INTO public.activity_sessions (
    id, user_id, sport_type, sport_subtype, pool_type, stroke,
    start_time, end_time, duration_s, distance_m, elev_gain_m,
    avg_heart_rate, max_heart_rate, avg_power_w, max_power_w,
    avg_cadence, calories_kcal, rpe, name, notes, endurance_template_id,
    source, provider, status, timezone, started_at_local, ended_at_local
  ) VALUES (
    v_session_id,
    v_user_id,
    v_sport_type::public.sport_type_enum,
    NULLIF(p_session->>'sport_subtype', ''),
    NULLIF(p_session->>'pool_type', ''),
    NULLIF(p_session->>'stroke', ''),
    (p_session->>'start_time')::timestamptz,
    COALESCE(NULLIF(p_session->>'end_time', '')::timestamptz, (p_session->>'start_time')::timestamptz + make_interval(secs => v_duration_s)),
    CASE WHEN v_duration_s > 0 THEN v_duration_s ELSE NULL END,
    CASE WHEN v_distance_m > 0 THEN v_distance_m ELSE NULL END,
    NULLIF(p_session->>'elev_gain_m', '')::numeric,
    NULLIF(p_session->>'avg_heart_rate', '')::integer,
    NULLIF(p_session->>'max_heart_rate', '')::integer,
    NULLIF(p_session->>'avg_power_w', '')::integer,
    NULLIF(p_session->>'max_power_w', '')::integer,
    NULLIF(p_session->>'avg_cadence', '')::integer,
    NULLIF(p_session->>'calories_kcal', '')::numeric,
    NULLIF(p_session->>'rpe', '')::numeric,
    p_session->>'name',
    NULLIF(p_session->>'notes', ''),
    v_template_id,
    'manual'::public.activity_source_enum,
    'manual'::public.provider_enum,
    'completed'::public.activity_status_enum,
    COALESCE(NULLIF(p_session->>'timezone', ''), current_setting('TIMEZONE')),
    NULLIF(p_session->>'started_at_local', '')::timestamp,
    NULLIF(p_session->>'ended_at_local', '')::timestamp
  );

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_endurance_activity(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_endurance_activity(jsonb, jsonb) TO authenticated;
