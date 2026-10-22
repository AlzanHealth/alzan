import assert from 'node:assert/strict';
import { getMeasurementLabelKey, matchesMeasurementSeries, measurementSeriesKey } from './measurementProtocols';

const relaxed = { measurement_type: 'arm', measurement_protocol: 'arm_relaxed_midpoint' } as const;
const flexed = { measurement_type: 'arm', measurement_protocol: 'arm_flexed_max' } as const;
const legacyArm = { measurement_type: 'arm', measurement_protocol: null } as const;
const legacyWaist = { measurement_type: 'waist', measurement_protocol: null } as const;
assert.notEqual(measurementSeriesKey(relaxed), measurementSeriesKey(flexed));
assert.notEqual(measurementSeriesKey(legacyArm), measurementSeriesKey(relaxed));
assert.equal(matchesMeasurementSeries(flexed, 'arm', 'arm_relaxed_midpoint'), false);
assert.equal(matchesMeasurementSeries(legacyArm, 'arm', 'arm_relaxed_midpoint'), false);
assert.equal(matchesMeasurementSeries(legacyWaist, 'waist', 'waist_iliac_crest'), false);
assert.equal(getMeasurementLabelKey(legacyArm), 'health.armUnspecified');
assert.equal(getMeasurementLabelKey(legacyWaist), 'health.waistUnspecified');
assert.equal(
  matchesMeasurementSeries({ measurement_type: 'abdomen', measurement_protocol: null }, 'abdomen', 'abdomen_navel'),
  true,
);
assert.equal(
  measurementSeriesKey({ measurement_type: 'abdomen', measurement_protocol: null }),
  measurementSeriesKey({ measurement_type: 'abdomen', measurement_protocol: 'abdomen_navel' }),
);
console.log('measurementProtocols tests passed');
