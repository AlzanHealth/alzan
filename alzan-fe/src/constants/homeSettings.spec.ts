import assert from 'node:assert/strict';
import {
  DEFAULT_HOME_CARDS_ORDER,
  DEFAULT_HOME_MODE,
  DEFAULT_HOME_PDF_SECTION_ORDER,
  DEFAULT_HOME_PRIMARY_ACTION,
  normalizeHomeCardOrder,
  normalizeHomeMode,
  normalizeHomePdfSectionOrder,
  normalizeHomePrimaryAction,
} from './homeSettings';

assert.deepEqual(normalizeHomeCardOrder(['steps', 'kcal', 'weight', 'sleep']), ['steps', 'kcal', 'weight', 'sleep']);
assert.deepEqual(normalizeHomeCardOrder(['steps', 'steps', 'unknown', 'workouts']), [
  'steps',
  'workouts',
  'weight',
  'sleep',
]);
assert.deepEqual(normalizeHomeCardOrder(null), DEFAULT_HOME_CARDS_ORDER);

assert.equal(normalizeHomeMode('compact'), 'compact');
assert.equal(normalizeHomeMode('detailed'), 'detailed');
assert.equal(normalizeHomeMode('dense'), DEFAULT_HOME_MODE);

assert.equal(normalizeHomePrimaryAction('add_meal'), 'add_meal');
assert.equal(normalizeHomePrimaryAction('open_nutrition'), 'open_nutrition');
assert.equal(normalizeHomePrimaryAction('hydrate'), DEFAULT_HOME_PRIMARY_ACTION);

assert.deepEqual(normalizeHomePdfSectionOrder(['nutrition', 'health', 'training']), [
  'nutrition',
  'health',
  'training',
]);
assert.deepEqual(normalizeHomePdfSectionOrder(['training', 'training', 'unknown']), [
  'training',
  'health',
  'nutrition',
]);
assert.deepEqual(normalizeHomePdfSectionOrder(null), DEFAULT_HOME_PDF_SECTION_ORDER);
