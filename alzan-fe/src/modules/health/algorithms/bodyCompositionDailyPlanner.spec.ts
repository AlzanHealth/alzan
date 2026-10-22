/** Run: pnpm --prefix alzan-fe exec tsx src/modules/health/algorithms/bodyCompositionDailyPlanner.spec.ts */
import assert from 'node:assert/strict';
import { planDailyBodyCompositionRecalculation, DailyCompositionPlannerInput } from './bodyCompositionDailyPlanner';

const now = new Date('2026-07-08T12:00:00.000Z');
const profile = { heightCm: 180, age: 30, sex: 'male' as const };
const base: DailyCompositionPlannerInput = { targetDate: now, now, profile, weights: [], measurements: [] };
const weight = (measuredAt: string, weightKg = 80) => ({ id: measuredAt, measuredAt, weightKg });
const waist = (measuredAt: string, protocol: string | null = 'waist_iliac_crest') => ({
  type: 'waist' as const,
  measuredAt,
  valueCm: 90,
  protocol,
});
const plan = (patch: Partial<DailyCompositionPlannerInput>) =>
  planDailyBodyCompositionRecalculation({ ...base, ...patch });

const partial = plan({ measurements: [waist(now.toISOString())] });
assert.equal(partial.shouldCalculate, true);
assert.equal(partial.shouldUpsert, true);
assert.equal(partial.result?.bodyFat?.method, 'rfm');
assert.equal(partial.result?.fatMassKg, null);
assert.equal(partial.sourceWeightLogId, undefined);
assert.equal(partial.shouldUpdateWeightLog, false);
assert.equal(partial.selectedMeasurements[0]?.protocol, 'waist_iliac_crest');
assert.equal(partial.asOf, now.toISOString());

for (const offset of [0, 72 * 3600000, 72 * 3600000 + 1, -1]) {
  const measuredAt = new Date(now.getTime() - offset).toISOString();
  const eligible = offset >= 0 && offset <= 72 * 3600000;
  const result = plan({ weights: [weight(measuredAt)], measurements: [waist(measuredAt)] });
  assert.equal(!!result.result?.bmi, eligible, `weight exact timestamp ${offset}`);
  assert.equal(!!result.result?.bodyFat, eligible, `waist exact timestamp ${offset}`);
}
for (const protocol of [null, 'waist_umbilical', 'unknown']) {
  assert.equal(plan({ measurements: [waist(now.toISOString(), protocol)] }).result?.bodyFat, null);
}
const abdomen = plan({ measurements: [{ type: 'abdomen', measuredAt: now.toISOString(), valueCm: 90 }] });
assert.equal(abdomen.result?.bodyFat, null);
assert.equal(abdomen.measurements.abdomen, 90);
const arms = plan({
  measurements: [
    { type: 'arm', valueCm: 40, measuredAt: now.toISOString(), protocol: 'arm_flexed_max' },
    { type: 'arm', valueCm: 35, measuredAt: now.toISOString(), protocol: 'arm_relaxed_midpoint' },
    { type: 'arm', valueCm: 45, measuredAt: now.toISOString() },
  ],
});
assert.equal(arms.measurements.arm, 35);
assert.equal(arms.measurements.armFlexed, 40);
assert.equal(arms.selectedMeasurements.length, 2);
assert.equal(arms.result?.muscle, null);
const stale = { bodyfatPercent: 20, bodyfatPrecisionLevel: 3, muscleMassKg: 40, musclePrecisionLevel: 3, bmi: 24.7 };
const deleted = plan({ storedComposition: stale });
assert.equal(deleted.shouldUpsert, true);
assert.equal(deleted.bodyfatShouldReplace, true);
assert.equal(deleted.muscleShouldReplace, true);
assert.equal(deleted.result?.bodyFat, null);
assert.equal(deleted.result?.muscle, null);
const lowerPrecision = plan({ weights: [weight(now.toISOString())], storedComposition: stale });
assert.equal(lowerPrecision.result?.bodyFat?.method, 'cun_bae');
assert.equal(lowerPrecision.bodyfatShouldReplace, true);
assert.equal(lowerPrecision.muscleShouldReplace, true);
assert.equal(lowerPrecision.shouldUpsert, true);
const bmiOnly = plan({ profile: { heightCm: 180, age: null, sex: null }, weights: [weight(now.toISOString())] });
assert.equal(bmiOnly.result?.bmi?.value, 24.7);
assert.equal(bmiOnly.shouldUpsert, true);
assert.equal(bmiOnly.result?.bodyFat, null);
// Historical end-of-day anchor follows local time, including timezone/DST boundaries.
const historicalTarget = new Date(2026, 6, 1, 12);
const end = new Date(2026, 6, 2).getTime() - 1;
for (const offset of [72 * 3600000, 72 * 3600000 + 1, -1]) {
  const result = plan({ targetDate: historicalTarget, measurements: [waist(new Date(end - offset).toISOString())] });
  assert.equal(!!result.result?.bodyFat, offset === 72 * 3600000, `historical boundary ${offset}`);
}
const old = new Date(now.getTime() - 2 * 3600000).toISOString();
const latest = plan({
  weights: [weight(old, 79), weight(now.toISOString(), 81)],
  measurements: [waist(old), { ...waist(now.toISOString()), valueCm: 92 }],
});
assert.equal(latest.weightKgUsed, 81);
assert.equal(latest.measurements.waist, 92);
assert.equal(latest.selectedMeasurements.length, 1);
assert.equal(latest.shouldUpdateWeightLog, true);
console.log('Daily planner partial inputs, protocols, 72h boundaries, history, and invalidation regressions passed');

const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
const future = plan({
  targetDate: tomorrow,
  weights: [weight(now.toISOString())],
  measurements: [waist(now.toISOString())],
  storedComposition: stale,
});
assert.equal(future.reason, 'future_date');
assert.equal(future.shouldCalculate, false);
assert.equal(future.shouldUpsert, false);
assert.equal(future.result, undefined);
assert.equal(future.sourceWeightLogId, undefined);
assert.deepEqual(future.measurements, {});
assert.deepEqual(future.selectedMeasurements, []);
const sameDayLater = plan({ targetDate: new Date(now.getTime() + 3600000), measurements: [waist(now.toISOString())] });
assert.equal(sameDayLater.asOf, now.toISOString());
assert.equal(sameDayLater.result?.bodyFat?.method, 'rfm');
const unknownAge = plan({ profile: { ...profile, age: null }, measurements: [waist(now.toISOString())] });
assert.equal(unknownAge.reason, 'missing_profile');
assert.equal(unknownAge.result?.bodyFat, null);

const invalidLatest = plan({ measurements: [waist(old), { ...waist(now.toISOString()), valueCm: 201 }] });
assert.equal(invalidLatest.measurements.waist, 90);
assert.equal(invalidLatest.result?.bodyFat?.method, 'rfm');
assert.equal(invalidLatest.selectedMeasurements[0]?.measuredAt, old);

const tiedWeights = [
  { ...weight(now.toISOString(), 80), id: 'a' },
  { ...weight(now.toISOString(), 82), id: 'b' },
];
const tiedMeasurements = [
  { ...waist(now.toISOString()), id: 'a', valueCm: 90 },
  { ...waist(now.toISOString()), id: 'b', valueCm: 92 },
];
const tied = plan({ weights: tiedWeights, measurements: tiedMeasurements });
const reversed = plan({ weights: [...tiedWeights].reverse(), measurements: [...tiedMeasurements].reverse() });
assert.deepEqual(tied, reversed);
assert.equal(tied.sourceWeightLogId, 'b');
assert.equal(tied.measurements.waist, 92);
const createdFirst = plan({
  measurements: [
    { ...waist(now.toISOString()), id: 'z', valueCm: 90, createdAt: old },
    { ...waist(now.toISOString()), id: 'a', valueCm: 91, createdAt: now.toISOString() },
  ],
});
assert.equal(createdFirst.measurements.waist, 91);
const withoutIds = [waist(now.toISOString()), { ...waist(now.toISOString()), valueCm: 92 }];
assert.deepEqual(plan({ measurements: withoutIds }), plan({ measurements: [...withoutIds].reverse() }));
