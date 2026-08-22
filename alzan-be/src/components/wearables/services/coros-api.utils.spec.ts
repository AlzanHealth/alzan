import { strict as assert } from 'assert';
import * as utils from './coros-api.utils';
assert.deepEqual(utils.buildCorosDateWindows(new Date('2026-05-01T12:00:00Z'), new Date('2026-07-29T12:00:00Z')), [
  { startDate: '20260501', endDate: '20260530' },
  { startDate: '20260531', endDate: '20260629' },
  { startDate: '20260630', endDate: '20260729' },
]);

const workout = { labelId: 'label-1' };
assert.deepEqual(utils.extractCorosWorkoutRecords({ data: [workout] }), [workout]);
assert.deepEqual(utils.extractCorosWorkoutRecords({ sportDataList: [workout] }), [workout]);
assert.deepEqual(utils.extractCorosWorkoutRecords([workout]), [workout]);
assert.deepEqual(utils.extractCorosWorkoutRecords({ data: 'invalid' }), []);

const daily = { happenDay: 20260729, step: 10_000 };
assert.deepEqual(utils.extractCorosDailyRecords({ data: [daily] }), [daily]);
assert.deepEqual(utils.extractCorosDailyRecords({ dailyDataList: [daily] }), [daily]);

const fitBytes = new Uint8Array(16);
fitBytes[0] = 14;
fitBytes.set(Buffer.from('.FIT'), 8);
utils.assertCorosFitBytes(fitBytes);
assert.throws(() => utils.assertCorosFitBytes(Uint8Array.from(Buffer.from('<html>not fit</html>'))));
assert.throws(() => utils.assertCorosFitBytes(fitBytes, 12));

utils.assertCorosWebhookPayloadSize({ sportDataList: [{ labelId: 'small' }] }, 100);
assert.throws(() => utils.assertCorosWebhookPayloadSize({ sportDataList: [{ fitUrl: 'x'.repeat(200) }] }, 100));
