import assert from 'node:assert/strict';
import { isDateWithinTemplateRecurrence, shouldAutoPropagateTemplate } from './trainingPropagation.helper';

assert.equal(shouldAutoPropagateTemplate({ source: 'imported' }), false);
assert.equal(shouldAutoPropagateTemplate({ source: 'importing' }), false);
assert.equal(shouldAutoPropagateTemplate({ source: 'seed' }), true);
assert.equal(shouldAutoPropagateTemplate({ source: 'unknown' }), true);
assert.equal(shouldAutoPropagateTemplate({ source: 'user' }), true);
assert.equal(shouldAutoPropagateTemplate({ source: null }), true);

const boundedTemplate = {
  recurrence_start_date: '2026-07-06',
  recurrence_end_date: '2026-07-19',
};
assert.equal(isDateWithinTemplateRecurrence('2026-07-05', boundedTemplate), false);
assert.equal(isDateWithinTemplateRecurrence('2026-07-06', boundedTemplate), true);
assert.equal(isDateWithinTemplateRecurrence('2026-07-19', boundedTemplate), true);
assert.equal(isDateWithinTemplateRecurrence('2026-07-20', boundedTemplate), false);
assert.equal(
  isDateWithinTemplateRecurrence('2026-07-20', {
    recurrence_start_date: null,
    recurrence_end_date: null,
  }),
  true,
);
