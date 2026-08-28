CREATE TABLE IF NOT EXISTS public.shopping_list_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  range_start date NOT NULL,
  range_end date NOT NULL,
  ingredient_key text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  purchase_quantity_g numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopping_list_states_range_order CHECK (range_start <= range_end),
  CONSTRAINT shopping_list_states_purchase_quantity_check CHECK (
    purchase_quantity_g IS NULL OR purchase_quantity_g > 0
  ),
  CONSTRAINT shopping_list_states_unique_item UNIQUE (user_id, range_start, range_end, ingredient_key)
);

CREATE INDEX IF NOT EXISTS shopping_list_states_user_range_idx
  ON public.shopping_list_states (user_id, range_start, range_end);

GRANT ALL ON TABLE public.shopping_list_states TO authenticated;
GRANT ALL ON TABLE public.shopping_list_states TO service_role;

ALTER TABLE public.shopping_list_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shopping_list_states_select_own ON public.shopping_list_states;
CREATE POLICY shopping_list_states_select_own
  ON public.shopping_list_states FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS shopping_list_states_insert_own ON public.shopping_list_states;
CREATE POLICY shopping_list_states_insert_own
  ON public.shopping_list_states FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS shopping_list_states_update_own ON public.shopping_list_states;
CREATE POLICY shopping_list_states_update_own
  ON public.shopping_list_states FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS shopping_list_states_delete_own ON public.shopping_list_states;
CREATE POLICY shopping_list_states_delete_own
  ON public.shopping_list_states FOR DELETE
  USING (auth.uid() = user_id);
