import { DbIngredient, IngredientSource, MealItemsSource } from '../../../types/requests.types';

export type FoodSearchResult = MealComponent;

/**
 * Calculated macros for actual amount
 */
export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

/**
 * The main ingredient type used in the Meal Builder UI.
 * Now aligned with DB 'ingredients' table + UI specific fields.
 */
export interface MealComponent extends Omit<Partial<DbIngredient>, 'source_primary'> {
  // Required fields for UI
  id: string; // Unique ID in the list (or source ID prefixed)
  name: string;
  description?: string;

  // Logic
  amount_g?: number; // The quantity selected/inputted
  calculated_macros?: Macros; // Optional, derived from amount * per_100g fields

  // Unified Source
  // 'source' field exists in DbIngredient (but as specific strings? No, DbIngredient doesn't have 'source' column in the Row definition shown earlier?
  // Let's check DbIngredient definition again. It has 'source_primary' and 'source_secondary'.
  // The 'source' field in previous MealComponent was 'database' | 'manual' etc.
  // We should keep a UI-only 'source' field for where this data came from in the current session.
  source: MealItemsSource;
  external_id?: string; // ID in the source system (e.g. ingredient UUID or recipe UUID)

  // Typed JSON fields - Now inherited from DbIngredient but explicit overrides are fine if needed.
  // source_primary is already in DbIngredient as IngredientSource | null.
  // We can just omit the override if types match, or keep it for clarity.
  // Since we extend Omit<Partial<DbIngredient>, 'source_primary'>, we currently re-define it.
  source_primary?: IngredientSource | null;

  // Metadata from previous type
  itemType?: 'ingredient' | 'recipe';
  brand?: string;
  barcode?: string;
  recipe_source?: 'system' | 'user';
  recipe_owner_user_id?: string | null;
  recipe_visibility?: 'private' | 'public';
  recipe_public_slug?: string | null;
  recipe_origin_id?: string | null;
  recipe_created_at?: string | null;
  recipe_updated_at?: string | null;
  recipe_popularity_score?: number;
  recipe_favorites_total?: number;
  recipe_saves_total?: number;
  recipe_uses_7d?: number;
  recipe_uses_30d?: number;
  recipe_uses_total?: number;
  recipe_author_name?: string; // Resolved display name / username of a user recipe's owner

  // Flattened macros (from DbIngredient) are:
  // kcal_100, protein_g_100, carbs_g_100, fat_g_100 (Note: DB uses fat_g_100 not fats_g_100 check types!)
  // DbIngredient has: kcal_100, protein_g_100, carbs_g_100, fat_g_100, fiber_g_100, sugar_g_100 ...

  // We need to map manual entry to these fields if they don't exist in Partial<DbIngredient>
}

/**
 * Calculate macros for a specific amount using flat fields
 */
export function calculateMacros(item: Partial<DbIngredient> | MealComponent, amount_g: number): Macros {
  const factor = amount_g / 100;
  // Handle potentially missing fields or different naming if DB uses fat_g_100
  const k = item.kcal_100 || 0;
  const p = item.protein_g_100 || 0;
  const c = item.carbs_g_100 || 0;
  const f = item.fat_g_100 || 0;

  return {
    kcal: Math.round(k * factor),
    protein_g: Math.round(p * factor * 10) / 10,
    carbs_g: Math.round(c * factor * 10) / 10,
    fats_g: Math.round(f * factor * 10) / 10,
  };
}

/**
 * Calculate total macros from multiple ingredients
 */
export function calculateTotalMacros(ingredients: MealComponent[]): Macros {
  const totals = ingredients.reduce(
    (acc, ing) => {
      const calculated = ing.calculated_macros || calculateMacros(ing, ing.amount_g || 0);
      return {
        kcal: acc.kcal + calculated.kcal,
        protein_g: acc.protein_g + calculated.protein_g,
        carbs_g: acc.carbs_g + calculated.carbs_g,
        fats_g: acc.fats_g + calculated.fats_g,
      };
    },
    { kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0 },
  );

  return {
    kcal: Math.round(totals.kcal),
    protein_g: Math.round(totals.protein_g * 10) / 10,
    carbs_g: Math.round(totals.carbs_g * 10) / 10,
    fats_g: Math.round(totals.fats_g * 10) / 10,
  };
}

/**
 * Generate automatic meal name from ingredients
 */
export function generateMealName(ingredients: MealComponent[]): string {
  if (ingredients.length === 0) return 'Comida';
  if (ingredients.length === 1) return ingredients[0].name || 'Ingrediente';
  if (ingredients.length === 2) return `${ingredients[0].name} y ${ingredients[1].name}`;

  // For 3+ ingredients: "Arroz, pollo y más"
  const first = ingredients[0].name;
  const second = ingredients[1].name;
  return `${first}, ${second} y más`;
}

/**
 * Check if any ingredient has incomplete data
 */
export function hasIncompleteData(_ingredients: MealComponent[]): boolean {
  return false;
}
