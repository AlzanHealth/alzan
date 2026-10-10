import assert from 'node:assert/strict';
import {
  calculateHeartRateZones,
  calculateHeartRateZonesFromReserve,
  calculateRestingHeartRateBaseline,
  analyzeRecentHeartRateSessions,
  calculateZonesFromMaxHeartRate,
  HEART_RATE_ZONE_COLORS,
  getHeartRateZoneDescriptionKey,
  getHeartRateZonePercentKey,
  getAgeOnDate,
  parseHeartRateZoneProfile,
  parseHeartRateInput,
  validateHeartRateZones,
} from './heartRateZones.helper';

assert.equal(HEART_RATE_ZONE_COLORS.length, 5);
assert.equal(getHeartRateZoneDescriptionKey(1), 'training.heartRateZoneRecovery');
assert.equal(getHeartRateZonePercentKey(5), 'training.heartRateZonePercent90to100');
assert.equal(parseHeartRateInput('190'), 190);
assert.equal(parseHeartRateInput(' 190 '), 190);
assert.equal(parseHeartRateInput('190.5'), null);
assert.equal(parseHeartRateInput('190bpm'), null);
assert.equal(parseHeartRateInput(''), null);
assert.deepEqual(calculateRestingHeartRateBaseline([58, 56, 55, 54, 53]), { bpm: 55, sampleCount: 5 });
assert.deepEqual(calculateRestingHeartRateBaseline([54, 58]), { bpm: 56, sampleCount: 2 });
assert.equal(calculateRestingHeartRateBaseline([20, 151, 54.5]), null);
assert.deepEqual(
  analyzeRecentHeartRateSessions(
    [
      { sessionId: 'a', values: [130, 180, 190, 191, 192], maxHeartRate: 192 },
      { sessionId: 'b', values: [140, 188, 189, 190], maxHeartRate: 190 },
      { sessionId: 'c', values: [100, 249], maxHeartRate: 249 },
    ],
    180,
  ),
  { sessionCount: 3, observedPeak: 249, repeatablePeak: 192, qualifiesForReview: true },
);
assert.equal(
  analyzeRecentHeartRateSessions(
    [
      { sessionId: 'spike', values: [100, 105, 249], maxHeartRate: 249 },
      { sessionId: 'easy', values: [90, 110, 120], maxHeartRate: 120 },
    ],
    180,
  ).qualifiesForReview,
  false,
);
assert.equal(
  analyzeRecentHeartRateSessions(
    [
      { sessionId: 'a', values: [], maxHeartRate: 198 },
      { sessionId: 'b', values: [], maxHeartRate: 197 },
    ],
    180,
  ).qualifiesForReview,
  false,
);
assert.deepEqual(
  [1, 2, 3, 4, 5].map(zone => getHeartRateZoneDescriptionKey(zone as 1 | 2 | 3 | 4 | 5)),
  [
    'training.heartRateZoneRecovery',
    'training.heartRateZoneAerobic',
    'training.heartRateZoneTempo',
    'training.heartRateZoneThreshold',
    'training.heartRateZoneVo2',
  ],
);
assert.equal(getAgeOnDate('2000-10-10', new Date(2026, 9, 9)), 25);
assert.equal(getAgeOnDate('2000-10-10', new Date(2026, 9, 10)), 26);
assert.equal(getAgeOnDate('not-a-date', new Date(2026, 9, 10)), null);
assert.equal(getAgeOnDate(null, new Date(2026, 9, 10)), null);
assert.equal(getAgeOnDate('2020-02-30', new Date(2026, 9, 10)), null);
assert.equal(getAgeOnDate('2026-10-11', new Date(2026, 9, 10)), null);
assert.equal(getAgeOnDate('2008-10-10', new Date(2026, 9, 10)), 18);

const zones = calculateHeartRateZones(30);
assert.equal(zones?.maxHeartRate, 187);
assert.deepEqual(zones?.zones, [
  { zone: 1, min: 0, max: 112 },
  { zone: 2, min: 113, max: 131 },
  { zone: 3, min: 132, max: 150 },
  { zone: 4, min: 151, max: 168 },
  { zone: 5, min: 169, max: 187 },
]);
assert.equal(zones ? validateHeartRateZones(zones.zones) : 'missing', null);
assert.equal(validateHeartRateZones([{ zone: 1, min: 0, max: 100 }]), 'incomplete');
assert.equal(
  validateHeartRateZones([
    { zone: 1, min: 0, max: 100 },
    { zone: 2, min: 100, max: 120 },
    { zone: 3, min: 121, max: 140 },
    { zone: 4, min: 141, max: 160 },
    { zone: 5, min: 161, max: 180 },
  ]),
  'overlap',
);
assert.equal(
  validateHeartRateZones([
    { zone: 1, min: 0, max: 100 },
    { zone: 2, min: 102, max: 120 },
    { zone: 3, min: 121, max: 140 },
    { zone: 4, min: 141, max: 160 },
    { zone: 5, min: 161, max: 180 },
  ]),
  'gap',
);
assert.equal(calculateHeartRateZones(17), null);
assert.equal(calculateHeartRateZones(81)?.maxHeartRate, 151);
assert.equal(calculateHeartRateZones(82), null);
assert.equal(calculateHeartRateZones(18)?.maxHeartRate, 195);
assert.equal(calculateZonesFromMaxHeartRate(250)?.zones[4].max, 250);
assert.equal(calculateZonesFromMaxHeartRate(59), null);
assert.deepEqual(calculateHeartRateZonesFromReserve(190, 50)?.zones, [
  { zone: 1, min: 120, max: 134 },
  { zone: 2, min: 135, max: 148 },
  { zone: 3, min: 149, max: 162 },
  { zone: 4, min: 163, max: 176 },
  { zone: 5, min: 177, max: 190 },
]);
assert.equal(calculateHeartRateZonesFromReserve(190, 190), null);
assert.equal(calculateHeartRateZonesFromReserve(100, 95), null);
assert.equal(calculateHeartRateZonesFromReserve(190, 0), null);
assert.equal(calculateHeartRateZonesFromReserve(50, 40), null);
assert.equal(
  calculateHeartRateZonesFromReserve(190, 50)?.zones.every(
    (zone, index, allZones) => index === 0 || zone.min === allZones[index - 1].max + 1,
  ),
  true,
);
assert.equal(validateHeartRateZones(calculateZonesFromMaxHeartRate(190)?.zones ?? []), null);
assert.equal(
  validateHeartRateZones([
    { zone: 1, min: 0, max: 100 },
    { zone: 2, min: 101, max: 120 },
    { zone: 3, min: 121, max: 140 },
    { zone: 4, min: 141, max: 160 },
    { zone: 5, min: 161, max: 251 },
  ]),
  'invalid',
);
assert.equal(
  validateHeartRateZones([
    { zone: 1, min: 0, max: 0 },
    { zone: 2, min: 0, max: 0 },
    { zone: 3, min: 0, max: 0 },
    { zone: 4, min: 0, max: 0 },
    { zone: 5, min: 0, max: 0 },
  ]),
  'incomplete',
);
assert.equal(
  parseHeartRateZoneProfile({
    maxHeartRate: 187,
    zones: zones?.zones,
    method: 'tanaka',
    source: 'age_estimate',
    updatedAt: '2026-10-10T00:00:00.000Z',
  })?.method,
  'tanaka',
);
assert.equal(
  parseHeartRateZoneProfile({
    maxHeartRate: 190,
    restingHeartRate: 50,
    zones: calculateHeartRateZonesFromReserve(190, 50)?.zones,
    method: 'karvonen',
    source: 'age_estimate',
    updatedAt: '2026-10-10T00:00:00.000Z',
  })?.method,
  'karvonen',
);
assert.equal(
  parseHeartRateZoneProfile({
    maxHeartRate: 190,
    zones: calculateHeartRateZonesFromReserve(190, 50)?.zones,
    method: 'karvonen',
    source: 'age_estimate',
    updatedAt: '2026-10-10T00:00:00.000Z',
  }),
  null,
);
assert.equal(parseHeartRateZoneProfile({ maxHeartRate: 187, zones: [], method: 'tanaka' }), null);
console.log('Heart rate zones helper tests passed');
