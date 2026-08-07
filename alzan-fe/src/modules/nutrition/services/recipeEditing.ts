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

export type PresetRecipeDraftMode =
  | {
      mode: 'edit-existing';
      editingRecipeId: string;
      originalSignature: string;
    }
  | {
      mode: 'copy';
      editingRecipeId: null;
      originalSignature: null;
    };

export type RecipeSaveMode = 'update-existing' | 'create-new' | 'no-changes';

export type SavedRecipeDraftState = {
  editingRecipeId: string;
  editingRecipeName: string;
  editingRecipeUpdatedAt: string;
  editingRecipeSignature: string;
  mealSourceRecipeId: string;
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

export const getRecipeSaveMode = ({
  editingRecipeId,
  originalName,
  currentName,
  originalSignature,
  currentSignature,
}: {
  editingRecipeId: string | null;
  originalName: string | null;
  currentName: string;
  originalSignature: string | null;
  currentSignature: string;
}): RecipeSaveMode => {
  if (originalSignature !== null && originalSignature === currentSignature) return 'no-changes';
  if (!editingRecipeId) return 'create-new';
  if (normalizeRecipeName(originalName ?? '') !== normalizeRecipeName(currentName)) return 'create-new';
  return 'update-existing';
};

export const getPresetRecipeDraftMode = ({
  editableRecipeId,
  originalSignature,
}: {
  editableRecipeId: string | null;
  originalSignature: string | null;
}): PresetRecipeDraftMode => {
  if (!editableRecipeId || !originalSignature) {
    return {
      mode: 'copy',
      editingRecipeId: null,
      originalSignature: null,
    };
  }

  return {
    mode: 'edit-existing',
    editingRecipeId: editableRecipeId,
    originalSignature,
  };
};

export const getMealSourceRecipeIdForSave = ({
  selectedRecipeId,
  existingSourceRecipeId,
}: {
  selectedRecipeId: string | null;
  existingSourceRecipeId: string | null;
}): string | null => selectedRecipeId ?? existingSourceRecipeId;

export const getSavedRecipeDraftState = ({
  recipeId,
  recipeName,
  recipeUpdatedAt,
  recipeSignature,
}: {
  recipeId: string;
  recipeName: string;
  recipeUpdatedAt: string;
  recipeSignature: string;
}): SavedRecipeDraftState => ({
  editingRecipeId: recipeId,
  editingRecipeName: recipeName,
  editingRecipeUpdatedAt: recipeUpdatedAt,
  editingRecipeSignature: recipeSignature,
  mealSourceRecipeId: recipeId,
});

export const buildRecipeSoftDeletePayload = (deletedAt: string): RecipeSoftDeletePayload => ({
  deleted_at: deletedAt,
  updated_at: deletedAt,
});
