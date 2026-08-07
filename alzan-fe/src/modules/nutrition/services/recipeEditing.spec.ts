import assert from 'node:assert/strict';

import {
  buildEditableRecipeSignature,
  buildRecipeSoftDeletePayload,
  canSubmitRecipeDraft,
  getRecipeSaveMode,
  getMealSourceRecipeIdForSave,
  getPresetRecipeDraftMode,
  isOwnUserRecipe,
} from './recipeEditing';

function run() {
  const currentUserId = 'user-1';

  assert.equal(isOwnUserRecipe({ recipe_source: 'user', recipe_owner_user_id: currentUserId }, currentUserId), true);
  assert.equal(isOwnUserRecipe({ recipe_source: 'system', recipe_owner_user_id: null }, currentUserId), false);
  assert.equal(isOwnUserRecipe({ recipe_source: 'user', recipe_owner_user_id: 'user-2' }, currentUserId), false);
  assert.equal(isOwnUserRecipe({ recipe_source: 'user', recipe_owner_user_id: currentUserId }, null), false);

  assert.equal(
    getMealSourceRecipeIdForSave({
      selectedRecipeId: 'recipe-from-library',
      existingSourceRecipeId: null,
    }),
    'recipe-from-library',
  );
  assert.equal(
    getMealSourceRecipeIdForSave({
      selectedRecipeId: null,
      existingSourceRecipeId: 'existing-recipe',
    }),
    'existing-recipe',
  );
  assert.equal(
    getMealSourceRecipeIdForSave({
      selectedRecipeId: null,
      existingSourceRecipeId: null,
    }),
    null,
  );

  assert.deepEqual(
    getPresetRecipeDraftMode({
      editableRecipeId: 'recipe-1',
      originalSignature: 'signature-1',
    }),
    {
      mode: 'edit-existing',
      editingRecipeId: 'recipe-1',
      originalSignature: 'signature-1',
    },
  );

  assert.deepEqual(
    getPresetRecipeDraftMode({
      editableRecipeId: null,
      originalSignature: null,
    }),
    {
      mode: 'copy',
      editingRecipeId: null,
      originalSignature: null,
    },
  );

  const originalSignature = buildEditableRecipeSignature({
    name: 'Tortilla',
    ingredients: [
      { ingredientId: 'egg', quantity: 120, unit: 'g' },
      { ingredientId: 'potato', quantity: 200, unit: 'g' },
    ],
  });

  assert.equal(
    canSubmitRecipeDraft({
      name: 'Tortilla',
      ingredientsLength: 2,
      originalSignature,
      currentSignature: originalSignature,
    }),
    false,
  );

  assert.equal(
    canSubmitRecipeDraft({
      name: 'Tortilla',
      ingredientsLength: 2,
      originalSignature: null,
      currentSignature: originalSignature,
    }),
    true,
  );

  assert.equal(
    getRecipeSaveMode({
      editingRecipeId: 'recipe-1',
      originalName: 'Tortilla',
      currentName: ' Tortilla ',
      originalSignature,
      currentSignature: originalSignature,
    }),
    'no-changes',
  );

  const changedWeightSignature = buildEditableRecipeSignature({
    name: 'Tortilla',
    ingredients: [
      { ingredientId: 'egg', quantity: 130, unit: 'g' },
      { ingredientId: 'potato', quantity: 200, unit: 'g' },
    ],
  });

  assert.equal(
    canSubmitRecipeDraft({
      name: 'Tortilla',
      ingredientsLength: 2,
      originalSignature,
      currentSignature: changedWeightSignature,
    }),
    true,
  );

  const addedIngredientSignature = buildEditableRecipeSignature({
    name: 'Tortilla',
    ingredients: [
      { ingredientId: 'egg', quantity: 120, unit: 'g' },
      { ingredientId: 'potato', quantity: 200, unit: 'g' },
      { ingredientId: 'onion', quantity: 80, unit: 'g' },
    ],
  });

  assert.equal(
    canSubmitRecipeDraft({
      name: 'Tortilla',
      ingredientsLength: 3,
      originalSignature,
      currentSignature: addedIngredientSignature,
    }),
    true,
  );

  const removedIngredientSignature = buildEditableRecipeSignature({
    name: 'Tortilla',
    ingredients: [{ ingredientId: 'egg', quantity: 120, unit: 'g' }],
  });
  const replacedIngredientSignature = buildEditableRecipeSignature({
    name: 'Tortilla',
    ingredients: [
      { ingredientId: 'egg', quantity: 120, unit: 'g' },
      { ingredientId: 'sweet-potato', quantity: 200, unit: 'g' },
    ],
  });

  assert.equal(
    getRecipeSaveMode({
      editingRecipeId: 'recipe-1',
      originalName: 'Tortilla',
      currentName: 'Tortilla',
      originalSignature,
      currentSignature: changedWeightSignature,
    }),
    'update-existing',
  );

  assert.equal(
    getRecipeSaveMode({
      editingRecipeId: 'recipe-1',
      originalName: 'Tortilla',
      currentName: 'Tortilla',
      originalSignature,
      currentSignature: addedIngredientSignature,
    }),
    'update-existing',
  );

  assert.equal(
    getRecipeSaveMode({
      editingRecipeId: 'recipe-1',
      originalName: 'Tortilla',
      currentName: 'Tortilla',
      originalSignature,
      currentSignature: removedIngredientSignature,
    }),
    'update-existing',
  );

  assert.equal(
    getRecipeSaveMode({
      editingRecipeId: 'recipe-1',
      originalName: 'Tortilla',
      currentName: 'Tortilla',
      originalSignature,
      currentSignature: replacedIngredientSignature,
    }),
    'update-existing',
  );

  assert.equal(
    getRecipeSaveMode({
      editingRecipeId: 'recipe-1',
      originalName: 'Tortilla',
      currentName: 'Tortilla de patata',
      originalSignature,
      currentSignature: changedWeightSignature,
    }),
    'create-new',
  );

  assert.equal(
    getRecipeSaveMode({
      editingRecipeId: null,
      originalName: null,
      currentName: 'Nueva receta',
      originalSignature: null,
      currentSignature: originalSignature,
    }),
    'create-new',
  );

  assert.equal(
    getRecipeSaveMode({
      editingRecipeId: null,
      originalName: 'Entrecot a la plancha',
      currentName: 'Entrecot a la plancha',
      originalSignature,
      currentSignature: originalSignature,
    }),
    'no-changes',
  );

  assert.deepEqual(buildRecipeSoftDeletePayload('2026-07-06T14:25:00.000Z'), {
    deleted_at: '2026-07-06T14:25:00.000Z',
    updated_at: '2026-07-06T14:25:00.000Z',
  });
}

run();
