import { supabase } from '../../../lib/supabaseClient';
import { fetchAllMenuImportAiIngredients, type MenuImportAiIngredientCatalogRow } from './menuImportAiCatalog';

const MENU_IMPORT_AI_INGREDIENT_SELECT = `
  id,
  name_es,
  name_en,
  category,
  unit_basis,
  kcal_100,
  protein_g_100,
  carbs_g_100,
  fat_g_100,
  source_primary
`;

export const fetchMenuImportAiIngredientCatalog = async (): Promise<MenuImportAiIngredientCatalogRow[]> =>
  fetchAllMenuImportAiIngredients(async (from, to) => {
    const { data, error } = await supabase
      .from('ingredients')
      .select(MENU_IMPORT_AI_INGREDIENT_SELECT)
      .order('name_es', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    return {
      data: (data ?? []) as unknown as MenuImportAiIngredientCatalogRow[],
      error,
    };
  });
