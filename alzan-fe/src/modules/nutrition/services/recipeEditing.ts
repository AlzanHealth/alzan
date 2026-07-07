export type EditableRecipeOwnership = {
  recipe_source?: 'system' | 'user' | null;
  recipe_owner_user_id?: string | null;
};

export type EditableRecipeSignatureIngredient = {
  ingredientId: string;
  quantity: number;
  unit?: string | null;
};

export type EditableRecipeSignatureInput = {
  name: string;
  ingredients: EditableRecipeSignatureIngredient[];
};

export type RecipeSoftDeletePayload = {
  deleted_at: string;
  updated_at: string;
};

const normalizeRecipeName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeQuantity = (quantity: number): number => Math.round(quantity * 10) / 10;

export const isOwnUserRecipe = (recipe: EditableRecipeOwnership, currentUserId: string | null | undefined): boolean => {
  return Boolean(currentUserId && recipe.recipe_source === 'user' && recipe.recipe_owner_user_id === currentUserId);
};

export const buildEditableRecipeSignature = ({ name, ingredients }: EditableRecipeSignatureInput): string => {
  return JSON.stringify({
    name: normalizeRecipeName(name),
    ingredients: ingredients.map((ingredient, orderIndex) => ({
      ingredientId: ingredient.ingredientId,
      quantity: normalizeQuantity(ingredient.quantity),
      unit: ingredient.unit ?? 'g',
      orderIndex,
    })),
  });
};

export const canSubmitRecipeDraft = ({
  name,
  ingredientsLength,
  originalSignature,
  currentSignature,
}: {
  name: string;
  ingredientsLength: number;
  originalSignature: string | null;
  currentSignature: string;
}): boolean => {
  return name.trim().length > 0 && ingredientsLength > 0 && originalSignature !== currentSignature;
};

export const buildRecipeSoftDeletePayload = (deletedAt: string): RecipeSoftDeletePayload => ({
  deleted_at: deletedAt,
  updated_at: deletedAt,
});
