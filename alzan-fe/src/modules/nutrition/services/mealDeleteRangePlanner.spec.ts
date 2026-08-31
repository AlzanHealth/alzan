import assert from 'node:assert/strict';
import { addDays, format } from 'date-fns';
import {
  buildFutureMealDeleteRange,
  getDefaultFutureMealDeleteRange,
  getFutureMealDeleteRangeBounds,
} from './mealDeleteRangePlanner';

const now = new Date(2026, 7, 31, 12);

const testDefaultFutureRangeStartsTomorrow = () => {
  const range = getDefaultFutureMealDeleteRange(now);

  assert.equal(format(range.start, 'yyyy-MM-dd'), '2026-09-01');
  assert.equal(format(range.end, 'yyyy-MM-dd'), '2026-09-07');
};

const testBoundsProtectPastAndLimitFarFuture = () => {
  const bounds = getFutureMealDeleteRangeBounds(now);

  assert.equal(format(bounds.minimumDate, 'yyyy-MM-dd'), '2026-09-01');
  assert.equal(format(bounds.maximumDate, 'yyyy-MM-dd'), '2027-08-31');
};

const testBuildsInclusiveFutureRange = () => {
  const result = buildFutureMealDeleteRange(addDays(now, 1), addDays(now, 10), now);

  assert.deepEqual(result, {
    start: '2026-09-01',
    end: '2026-09-10',
  });
};

const testRejectsPastStart = () => {
  assert.throws(() => buildFutureMealDeleteRange(now, addDays(now, 3), now), /future delete range must start tomorrow/);
};

const testRejectsEndBeforeStart = () => {
  assert.throws(
    () => buildFutureMealDeleteRange(addDays(now, 5), addDays(now, 4), now),
    /future delete range end must be on or after the start/,
  );
};

const run = async () => {
  testDefaultFutureRangeStartsTomorrow();
  testBoundsProtectPastAndLimitFarFuture();
  testBuildsInclusiveFutureRange();
  testRejectsPastStart();
  testRejectsEndBeforeStart();
  console.log('mealDeleteRangePlanner: all tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
