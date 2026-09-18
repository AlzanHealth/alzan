import assert from 'node:assert/strict';
import { validateNutritionExportRange } from './nutritionExportRange';

const now = new Date('2026-09-18T12:00:00');
const validate = (start: string, end: string) => validateNutritionExportRange(start, end, now);

assert.deepEqual(validate('2026-09-19', '2026-09-18'), { error: 'future', field: 'start' });
assert.deepEqual(validate('2026-09-01', '2026-09-19'), { error: 'future', field: 'end' });
for (const invalid of ['', '2026-09-', '2026-02-30', '2026-9-01', 'not a date']) {
  assert.deepEqual(validate(invalid, '2026-09-18'), { error: 'invalid', field: 'start' });
  assert.deepEqual(validate('2026-09-01', invalid), { error: 'invalid', field: 'end' });
}
assert.deepEqual(validate('2026-09-18', '2026-09-17'), { error: 'inverted' });
assert.deepEqual(validate('2026-06-17', '2026-09-18'), { error: 'tooLong' });
for (const [start, end] of [
  ['2026-06-18', '2026-09-18'],
  ['2026-09-18', '2026-09-18'],
  ['2024-02-29', '2024-03-01'],
  ['2026-03-01', '2026-04-01'],
]) {
  const result = validate(start, end);
  assert.equal(result.error, null);
  if (result.error === null) {
    assert.equal(result.startDate.getDate(), Number(start.slice(-2)));
    assert.equal(result.endDate.getDate(), Number(end.slice(-2)));
    assert.equal(result.startDate.getHours(), 0);
  }
}
// Correcting a rejected draft must export the newly visible dates, not a prior range.
validate('2026-09-01', '2026-09-19');
const corrected = validate('2026-09-02', '2026-09-17');
assert.equal(corrected.error, null);
if (corrected.error === null) {
  assert.equal(corrected.startDate.getDate(), 2);
  assert.equal(corrected.endDate.getDate(), 17);
}
console.log('Nutrition export range regression tests passed');
