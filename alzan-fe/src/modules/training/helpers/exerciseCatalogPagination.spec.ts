import assert from 'node:assert/strict';
import { paginateItems } from './exerciseCatalogPagination';

const items = Array.from({ length: 31 }, (_, index) => `exercise-${index + 1}`);

assert.deepEqual(paginateItems(items, 1, 30), {
  items: items.slice(0, 30),
  currentPage: 1,
  totalPages: 2,
  totalItems: 31,
});

assert.deepEqual(paginateItems(items, 2, 30), {
  items: ['exercise-31'],
  currentPage: 2,
  totalPages: 2,
  totalItems: 31,
});

assert.deepEqual(paginateItems([], 1, 30), {
  items: [],
  currentPage: 1,
  totalPages: 0,
  totalItems: 0,
});

assert.deepEqual(paginateItems(items, 99, 30), {
  items: ['exercise-31'],
  currentPage: 2,
  totalPages: 2,
  totalItems: 31,
});

console.log('Exercise catalog pagination checks passed');
