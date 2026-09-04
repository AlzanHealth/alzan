import { strict as assert } from 'assert';
import { buildCorosCanonicalActivity } from './coros-activity.utils';

const summary = {
  labelId: 'coros-activity-1',
  mode: 8,
  subMode: 1,
  startTime: '2026-09-04T06:00:00Z',
  endTime: '2026-09-04T06:30:00Z',
  duration: 1800,
  distance: 5000,
  calorie: 450000,
  activityType: 'Running',
};

const pending = buildCorosCanonicalActivity(summary, 'coros-activity-1', [], 'COROS_FIT_URL_MISSING');

assert.equal(pending.activity.providerActivityId, 'coros-activity-1');
assert.equal(pending.activity.sportType, 'running');
assert.equal(pending.activity.summary.durationSeconds, 1800);
assert.equal(pending.activity.summary.distanceM, 5000);
assert.deepEqual(pending.activity.pendingWatchMetrics, {
  provider: 'coros',
  providerActivityId: 'coros-activity-1',
  reason: 'COROS_FIT_URL_MISSING',
});

const complete = buildCorosCanonicalActivity(summary, 'coros-activity-1', [], null);
assert.equal(complete.activity.pendingWatchMetrics, null);

const summaryWins = buildCorosCanonicalActivity(
  {
    ...summary,
    avgHeartRate: 151,
    maxHeartRate: 181,
    avgSpeed: 3.9,
    avgCadence: 176,
    avgPower: 275,
    elevationGainM: 240,
  },
  'coros-activity-2',
  [],
  null,
);
assert.equal(summaryWins.activity.summary.avgHeartRate, 151);
assert.equal(summaryWins.activity.summary.maxHeartRate, 181);
assert.equal(summaryWins.activity.summary.avgSpeedMps, 3.9);
assert.equal(summaryWins.activity.summary.avgCadence, 176);
assert.equal(summaryWins.activity.summary.avgPowerW, 275);
assert.equal(summaryWins.activity.summary.elevationGainM, 240);

console.log('coros-activity.utils.spec.ts: all assertions passed');
