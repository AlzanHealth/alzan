ALTER TABLE public.shopping_list_states
  ADD COLUMN IF NOT EXISTS available_quantity_g numeric;

ALTER TABLE public.shopping_list_states
  DROP CONSTRAINT IF EXISTS shopping_list_states_available_quantity_check;

ALTER TABLE public.shopping_list_states
  ADD CONSTRAINT shopping_list_states_available_quantity_check CHECK (
    available_quantity_g IS NULL OR available_quantity_g >= 0
  );
