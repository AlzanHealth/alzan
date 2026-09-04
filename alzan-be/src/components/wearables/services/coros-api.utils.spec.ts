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
assert.deepEqual(utils.extractCorosWorkoutPage({ data: { sportDataList: [workout] }, hasMore: true, nextPage: 2 }), {
  records: [workout],
  nextPage: 2,
});
assert.deepEqual(utils.extractCorosWorkoutPage({ data: [workout] }), { records: [workout], nextPage: null });

const daily = { happenDay: 20260729, step: 10_000 };
assert.deepEqual(utils.extractCorosDailyRecords({ data: [daily] }), [daily]);
assert.deepEqual(utils.extractCorosDailyRecords({ dailyDataList: [daily] }), [daily]);
assert.deepEqual(utils.extractCorosDailyRecords({ result: '0000', data: { dailyList: [daily] } }), [daily]);

assert.doesNotThrow(() => utils.assertCorosApiSuccess({ result: '0000', message: 'OK', data: [] }));
assert.throws(
  () => utils.assertCorosApiSuccess({ result: '5011', message: 'The date is out of range' }),
  /COROS_API_ERROR_5011/,
);

const detailFitUrl = 'https://oss.coros.com/fit/workout.fit';
assert.deepEqual(utils.extractCorosFitUrls({ result: '0000', data: { fitUrl: detailFitUrl } }), [detailFitUrl]);
assert.deepEqual(
  utils.extractCorosFitUrls({
    result: '0000',
    data: {
      triathlonItemList: [
        { fitUrl: 'https://oss.coros.com/fit/swim.fit' },
        { fitUrl: 'https://oss.coros.com/fit/bike.fit' },
        { fitUrl: 'https://oss.coros.com/fit/run.fit' },
      ],
    },
  }),
  ['https://oss.coros.com/fit/swim.fit', 'https://oss.coros.com/fit/bike.fit', 'https://oss.coros.com/fit/run.fit'],
);
assert.throws(() => utils.extractCorosFitUrls({ result: '5016', message: 'No data found' }), /COROS_API_ERROR_5016/);

assert.deepEqual(utils.getCorosWebhookFailureState(0, new Date('2026-08-23T10:00:00.000Z')), {
  attempts: 1,
  isDeadLetter: false,
  nextAttemptAt: '2026-08-23T10:01:00.000Z',
});
assert.deepEqual(utils.getCorosWebhookFailureState(9, new Date('2026-08-23T10:00:00.000Z')), {
  attempts: 10,
  isDeadLetter: true,
  nextAttemptAt: null,
});

const fitBytes = new Uint8Array(16);
fitBytes[0] = 14;
fitBytes.set(Buffer.from('.FIT'), 8);
utils.assertCorosFitBytes(fitBytes);
assert.throws(() => utils.assertCorosFitBytes(Uint8Array.from(Buffer.from('<html>not fit</html>'))));
assert.throws(() => utils.assertCorosFitBytes(fitBytes, 12));

utils.assertCorosWebhookPayloadSize({ sportDataList: [{ labelId: 'small' }] }, 100);
assert.throws(() => utils.assertCorosWebhookPayloadSize({ sportDataList: [{ fitUrl: 'x'.repeat(200) }] }, 100));
