import assert from 'node:assert/strict';

import {
  buildEditableRecipeSignature,
  buildRecipeSoftDeletePayload,
  canSubmitRecipeDraft,
  isOwnUserRecipe,
} from './recipeEditing';

function run() {
  const currentUserId = 'user-1';

  assert.equal(isOwnUserRecipe({ recipe_source: 'user', recipe_owner_user_id: currentUserId }, currentUserId), true);
  assert.equal(isOwnUserRecipe({ recipe_source: 'system', recipe_owner_user_id: null }, currentUserId), false);
  assert.equal(isOwnUserRecipe({ recipe_source: 'user', recipe_owner_user_id: 'user-2' }, currentUserId), false);
  assert.equal(isOwnUserRecipe({ recipe_source: 'user', recipe_owner_user_id: currentUserId }, null), false);

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

  assert.deepEqual(buildRecipeSoftDeletePayload('2026-07-06T14:25:00.000Z'), {
    deleted_at: '2026-07-06T14:25:00.000Z',
    updated_at: '2026-07-06T14:25:00.000Z',
  });
}

run();
