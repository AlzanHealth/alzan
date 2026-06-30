import assert from 'node:assert/strict';
import { aggregateStepsByDate } from '../services/stepsAggregation';
import { StepsRow } from '../services/stepsApi';

function row(input: {
  date: string;
  id: string;
  isManual?: boolean;
  source: StepsRow['source'];
  sourcePackage?: string | null;
  totalSteps: number;
}): StepsRow {
  return {
    date: input.date,
    id: input.id,
    is_manual: input.isManual ?? false,
    source: input.source,
    source_package: input.sourcePackage ?? null,
    total_steps: input.totalSteps,
  };
}

function assertManualStepsOverrideProviderRows(): void {
  const aggregated = aggregateStepsByDate([
    row({
      date: '2026-06-24',
      id: 'apple',
      source: 'apple_health',
      sourcePackage: 'com.apple.Health',
      totalSteps: 8400,
    }),
    row({ date: '2026-06-24', id: 'garmin', source: 'garmin', totalSteps: 9200 }),
    row({ date: '2026-06-24', id: 'manual', isManual: true, source: 'manual', totalSteps: 7000 }),
  ]);

  assert.equal(aggregated.get('2026-06-24'), 7000);
}

function assertHighestProviderValueWinsWhenNoManualRowExists(): void {
  const aggregated = aggregateStepsByDate([
    row({
      date: '2026-06-25',
      id: 'apple',
      source: 'apple_health',
      sourcePackage: 'com.apple.Health',
      totalSteps: 8100,
    }),
    row({
      date: '2026-06-25',
      id: 'health-connect',
      source: 'health_connect',
      sourcePackage: 'com.garmin.android.apps.connectmobile',
      totalSteps: 9300,
    }),
    row({ date: '2026-06-25', id: 'garmin', source: 'garmin', totalSteps: 9200 }),
  ]);

  assert.equal(aggregated.get('2026-06-25'), 9300);
}

function assertProviderRowsAreNotSummedForTheSameDay(): void {
  const aggregated = aggregateStepsByDate([
    row({
      date: '2026-06-26',
      id: 'apple',
      source: 'apple_health',
      sourcePackage: 'com.apple.Health',
      totalSteps: 4000,
    }),
    row({ date: '2026-06-26', id: 'garmin', source: 'garmin', totalSteps: 5000 }),
    row({ date: '2026-06-27', id: 'suunto', source: 'suunto', totalSteps: 6200 }),
  ]);

  assert.equal(aggregated.get('2026-06-26'), 5000);
  assert.equal(aggregated.get('2026-06-27'), 6200);
  assert.equal(
    Array.from(aggregated.values()).reduce((sum, value) => sum + value, 0),
    11200,
  );
}

assertManualStepsOverrideProviderRows();
assertHighestProviderValueWinsWhenNoManualRowExists();
assertProviderRowsAreNotSummedForTheSameDay();
