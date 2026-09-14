-- A client read/merge/write cannot exclude another tab/device between the read
-- and the upsert. BEFORE UPDATE runs while PostgreSQL holds the conflicting row
-- lock, including ON CONFLICT DO UPDATE from older clients.
CREATE OR REPLACE FUNCTION public.shopping_list_states_keep_newest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Match mergeShoppingListStates: timestamp first, then a deterministic tuple.
  -- Missing quantity sorts below explicit zero. Never replace a timestamp with
  -- server now(), since retrying an old snapshot must not make it a new edit.
  IF ROW(NEW.updated_at, NEW.completed, NEW.hidden, COALESCE(NEW.available_quantity_g, -1))
     <= ROW(OLD.updated_at, OLD.completed, OLD.hidden, COALESCE(OLD.available_quantity_g, -1)) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shopping_list_states_keep_newest
BEFORE UPDATE ON public.shopping_list_states
FOR EACH ROW EXECUTE FUNCTION public.shopping_list_states_keep_newest();
