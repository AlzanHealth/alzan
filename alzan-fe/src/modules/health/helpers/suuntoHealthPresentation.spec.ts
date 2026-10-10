import assert from 'node:assert/strict';
import {
  addSuuntoSamplePage,
  aggregateDailyActivity,
  countStressStates,
  createSuuntoSampleAggregate,
  getHealthSummaryCardWidth,
  getSleepSessionForDate,
  getStressStateCategory,
  summarizeHealthValues,
} from './suuntoHealthPresentation';

function aggregatesStepsAndEnergyByCalendarDay(): void {
  const rows = [
    { date: '2026-10-08', total_steps: 4200, calories_kcal: 210 },
    { date: '2026-10-09', total_steps: 6300, calories_kcal: 280 },
  ];

  assert.deepEqual(
    aggregateDailyActivity(rows, 'steps').map(point => point.value),
    [4200, 6300],
  );
  assert.deepEqual(
    aggregateDailyActivity(rows, 'energy').map(point => point.value),
    [210, 280],
  );
  assert.equal(aggregateDailyActivity(rows, 'steps')[0]?.label, '2026-10-08');
  assert.deepEqual(
    aggregateDailyActivity(
      [
        { date: '2026-10-08', total_steps: null, calories_kcal: 210 },
        { date: '2026-10-09', total_steps: 6300, calories_kcal: null },
      ],
      'steps',
    ).map(point => point.value),
    [6300],
  );
  assert.deepEqual(
    aggregateDailyActivity(
      [
        { date: '2026-10-08', total_steps: null, calories_kcal: 210 },
        { date: '2026-10-09', total_steps: 6300, calories_kcal: null },
      ],
      'energy',
    ).map(point => point.value),
    [210],
  );
}

function countsOnlyKnownStressStates(): void {
  assert.deepEqual(countStressStates([1, 2, 2, 3, 4, 0, null, 8]), {
    relaxing: 1,
    active: 2,
    passive: 1,
    stressful: 1,
  });
}

function mapsLatestStressReadingToItsRecordedCategory(): void {
  assert.equal(getStressStateCategory(null), null);
  assert.equal(getStressStateCategory(0), 'invalid');
  assert.equal(getStressStateCategory(1), 'relaxing');
  assert.equal(getStressStateCategory(2), 'active');
  assert.equal(getStressStateCategory(3), 'passive');
  assert.equal(getStressStateCategory(4), 'stressful');
  assert.equal(getStressStateCategory(8), 'unknown');
}

function summarizesMetricValuesAndHandlesEmptyPeriods(): void {
  assert.deepEqual(summarizeHealthValues([55.2, 73.8, 88]), { average: 72, min: 55, max: 88 });
  assert.equal(summarizeHealthValues([]), null);
  const longHistory = Array.from({ length: 200_000 }, (_, index) => (index === 199_999 ? 120 : 60));
  assert.deepEqual(summarizeHealthValues(longHistory), { average: 60, min: 60, max: 120 });
}

function keepsSummaryCardsCompactAcrossScreenSizes(): void {
  assert.equal(getHealthSummaryCardWidth(), '48%');
}

function selectsSleepDetailsForTheChartedNight(): void {
  const sessions = [
    { date: '2026-10-08', score: 70 },
    { date: '2026-10-09', score: 82 },
  ];

  assert.deepEqual(getSleepSessionForDate(sessions, '2026-10-08'), sessions[0]);
  assert.deepEqual(getSleepSessionForDate(sessions), sessions[0]);
  assert.deepEqual(getSleepSessionForDate(sessions, '2026-10-07'), sessions[0]);
  assert.equal(getSleepSessionForDate([], '2026-10-08'), undefined);
}

function aggregatesSamplePagesWithoutRetainingIndividualReadings(): void {
  const aggregate = createSuuntoSampleAggregate();
  const bucketSize = 60 * 60_000;
  addSuuntoSamplePage(
    aggregate,
    [
      { metric_type: 'heart_rate', value: 60, recorded_at: '2026-10-10T10:00:00.000Z' },
      { metric_type: 'heart_rate', value: 90, recorded_at: '2026-10-10T10:30:00.000Z' },
      { metric_type: 'hrv_rmssd', value: 40, recorded_at: '2026-10-10T10:35:00.000Z' },
      { metric_type: 'recovery_balance', value: 0.5, recorded_at: '2026-10-10T10:35:00.000Z' },
      { metric_type: 'stress_state', value: 1, recorded_at: '2026-10-10T10:35:00.000Z' },
    ],
    bucketSize,
  );
  addSuuntoSamplePage(
    aggregate,
    [
      { metric_type: 'heart_rate', value: 120, recorded_at: '2026-10-10T11:00:00.000Z' },
      { metric_type: 'hrv_rmssd', value: 60, recorded_at: '2026-10-10T11:00:00.000Z' },
      { metric_type: 'recovery_balance', value: 0.7, recorded_at: '2026-10-10T11:00:00.000Z' },
      { metric_type: 'stress_state', value: 4, recorded_at: '2026-10-10T11:00:00.000Z' },
    ],
    bucketSize,
  );

  assert.equal(aggregate.sampleCount, 9);
  assert.deepEqual(aggregate.heartRate, { sum: 270, count: 3 });
  assert.deepEqual(aggregate.hrv, { sum: 100, count: 2 });
  assert.equal(aggregate.heartRateBuckets[Date.parse('2026-10-10T10:00:00.000Z')]?.sum, 150);
  assert.equal(Object.keys(aggregate.heartRateBuckets).length, 2);
  assert.equal(aggregate.latestRecoveryBalance, 0.7);
  assert.equal(aggregate.latestStressState, 4);
  assert.deepEqual(aggregate.stressCounts, { relaxing: 1, active: 0, passive: 0, stressful: 1 });
  const stressDay = new Date(Date.parse('2026-10-10T10:35:00.000Z'));
  stressDay.setHours(0, 0, 0, 0);
  assert.deepEqual(aggregate.stressBuckets[stressDay.getTime()], {
    relaxing: 1,
    active: 0,
    passive: 0,
    stressful: 1,
  });
}

aggregatesStepsAndEnergyByCalendarDay();
countsOnlyKnownStressStates();
mapsLatestStressReadingToItsRecordedCategory();
summarizesMetricValuesAndHandlesEmptyPeriods();
keepsSummaryCardsCompactAcrossScreenSizes();
selectsSleepDetailsForTheChartedNight();
aggregatesSamplePagesWithoutRetainingIndividualReadings();
