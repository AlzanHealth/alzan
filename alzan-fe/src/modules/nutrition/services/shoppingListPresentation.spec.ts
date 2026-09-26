import assert from 'node:assert/strict';
import { getShoppingDisplayIngredients } from './shoppingListPresentation';
import { filterShoppingIngredients, type ShoppingListIngredient } from './shoppingListPlanner';

const items: ShoppingListIngredient[] = [
  { key: 'rice', name: 'Rice', quantity_g: 500, category: 'cereal' },
  { key: 'milk', name: 'Milk', quantity_g: 500, category: 'lacteo' },
];
const completed = new Set(['rice']);
const pending = filterShoppingIngredients(items, completed, 'pending');
assert.deepEqual(getShoppingDisplayIngredients(items, pending, 'pending', new Set(['rice'])), items);
assert.deepEqual(getShoppingDisplayIngredients(items, pending, 'pending', new Set()), [items[1]]);
assert.deepEqual(pending, [items[1]], 'feedback must not add resolved products to exports');
const resolved = filterShoppingIngredients(items, completed, 'purchased');
assert.deepEqual(getShoppingDisplayIngredients(items, resolved, 'purchased', new Set(['milk'])), [items[0]]);
assert.deepEqual(getShoppingDisplayIngredients(items, items, 'all', new Set(['rice'])), items);
const inStock = [{ ...items[0], available_quantity_g: 500 }, items[1]];
assert.deepEqual(getShoppingDisplayIngredients(inStock, [inStock[1]], 'pending', new Set(['rice'])), inStock);
console.log('Shopping display: feedback, stable order, filters, stock and exports passed');
