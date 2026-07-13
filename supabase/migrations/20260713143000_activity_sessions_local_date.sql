CREATE OR REPLACE FUNCTION public.get_activity_sessions_for_local_date(
  p_user_id uuid,
  p_local_date date,
  p_timezone text
)
RETURNS SETOF public.activity_sessions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT activity_sessions.*
  FROM public.activity_sessions
  WHERE activity_sessions.user_id = p_user_id
    AND activity_sessions.start_time >= CASE
      WHEN p_timezone ~ '^[+-][0-9]{2}:[0-9]{2}$'
        THEN (p_local_date::timestamp - p_timezone::interval) AT TIME ZONE 'UTC'
      ELSE p_local_date::timestamp AT TIME ZONE p_timezone
    END
    AND activity_sessions.start_time < CASE
      WHEN p_timezone ~ '^[+-][0-9]{2}:[0-9]{2}$'
        THEN ((p_local_date + 1)::timestamp - p_timezone::interval) AT TIME ZONE 'UTC'
      ELSE (p_local_date + 1)::timestamp AT TIME ZONE p_timezone
    END
  ORDER BY activity_sessions.start_time ASC;
$$;

REVOKE ALL ON FUNCTION public.get_activity_sessions_for_local_date(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_activity_sessions_for_local_date(uuid, date, text) TO authenticated, service_role;
