import assert from 'node:assert/strict';
import { aggregateDailyActivity, countStressStates } from './suuntoHealthPresentation';

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
}

function countsOnlyKnownStressStates(): void {
  assert.deepEqual(countStressStates([1, 2, 2, 3, 4, 0, null, 8]), {
    relaxing: 1,
    active: 2,
    passive: 1,
    stressful: 1,
  });
}

aggregatesStepsAndEnergyByCalendarDay();
countsOnlyKnownStressStates();
