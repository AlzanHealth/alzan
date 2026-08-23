import assert from 'node:assert/strict';
import { addDays, format } from 'date-fns';
import { getDefaultCopyTargetDate, validateCopyTargetDate } from './copyCompletedSession.helper';

const referenceDate = new Date('2026-08-23T11:00:00.000Z');

assert.equal(getDefaultCopyTargetDate(referenceDate), '2026-08-24');

assert.deepEqual(
  validateCopyTargetDate({
    sourceDate: '2026-08-23',
    targetDate: format(addDays(referenceDate, 2), 'yyyy-MM-dd'),
  }),
  { ok: true },
);

assert.deepEqual(validateCopyTargetDate({ sourceDate: '2026-08-23', targetDate: '2026-08-23' }), {
  ok: false,
  reason: 'same_date',
});

assert.deepEqual(validateCopyTargetDate({ sourceDate: '2026-08-23', targetDate: '23/08/2026' }), {
  ok: false,
  reason: 'invalid_date',
});
