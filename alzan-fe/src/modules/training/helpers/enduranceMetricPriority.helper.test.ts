import assert from 'node:assert/strict';
import {
  DEFAULT_ENDURANCE_METRIC_PRIORITY,
  deriveEnduranceMetricValues,
  normalizeEnduranceMetricPriority,
  synchronizeEnduranceMetricValues,
} from './enduranceMetricPriority.helper';

const fromDistanceAndDuration = deriveEnduranceMetricValues(
  { distanceM: 2000, durationS: 600, intensity: null },
  'min/km',
);
assert.equal(fromDistanceAndDuration.intensity, 300);

const editedDuration = deriveEnduranceMetricValues(
  { distanceM: 2000, durationS: 300, intensity: 300 },
  'min/km',
  'duration',
);
assert.equal(editedDuration.distanceM, 1000);
assert.equal(editedDuration.intensity, 300);

const editedIntensity = deriveEnduranceMetricValues(
  { distanceM: 2000, durationS: 600, intensity: 600 },
  'min/km',
  'intensity',
);
assert.equal(editedIntensity.distanceM, 1000);
assert.equal(editedIntensity.durationS, 600);

const editedDistance = deriveEnduranceMetricValues(
  { distanceM: 1000, durationS: 600, intensity: 300 },
  'min/km',
  'distance',
);
assert.equal(editedDistance.distanceM, 1000);
assert.equal(editedDistance.intensity, 300);
assert.equal(editedDistance.durationS, 300);

const durationPriority = deriveEnduranceMetricValues(
  { distanceM: 2000, durationS: 900, intensity: 300 },
  'min/km',
  'duration',
  ['intensity', 'distance', 'duration'],
);
assert.equal(durationPriority.distanceM, 3000);
assert.equal(durationPriority.intensity, 300);
assert.equal(durationPriority.durationS, 900);

const distanceFromDurationAndPace = deriveEnduranceMetricValues(
  { distanceM: null, durationS: 600, intensity: 600 },
  'min/km',
  'intensity',
);
assert.equal(distanceFromDurationAndPace.distanceM, 1000);

const swimming = deriveEnduranceMetricValues({ distanceM: 1000, durationS: 1200, intensity: null }, 'min/100m');
assert.equal(swimming.intensity, 120);

const cycling = deriveEnduranceMetricValues({ distanceM: 36000, durationS: 3600, intensity: null }, 'km/h');
assert.equal(cycling.intensity, 36);

assert.deepEqual(normalizeEnduranceMetricPriority(['distance', 'distance']), ['distance', 'intensity', 'duration']);
assert.deepEqual(normalizeEnduranceMetricPriority(null), DEFAULT_ENDURANCE_METRIC_PRIORITY);

const synchronizedPriorityOneEdit = synchronizeEnduranceMetricValues(
  { distanceM: 2000, durationS: 600, intensity: 600 },
  'min/km',
  'intensity',
  ['intensity', 'duration', 'distance'],
);
assert.equal(synchronizedPriorityOneEdit.distanceM, 1000);
assert.equal(synchronizedPriorityOneEdit.durationS, 600);
assert.equal(synchronizedPriorityOneEdit.intensity, 600);

const synchronizedPriorityTwoEdit = synchronizeEnduranceMetricValues(
  { distanceM: 2000, durationS: 900, intensity: 300 },
  'min/km',
  'duration',
  ['intensity', 'duration', 'distance'],
);
assert.equal(synchronizedPriorityTwoEdit.distanceM, 3000);
assert.equal(synchronizedPriorityTwoEdit.durationS, 900);
assert.equal(synchronizedPriorityTwoEdit.intensity, 300);

const synchronizedPriorityThreeEdit = synchronizeEnduranceMetricValues(
  { distanceM: 3000, durationS: 600, intensity: 300 },
  'min/km',
  'distance',
  ['intensity', 'duration', 'distance'],
);
assert.equal(synchronizedPriorityThreeEdit.distanceM, 3000);
assert.equal(synchronizedPriorityThreeEdit.durationS, 900);
assert.equal(synchronizedPriorityThreeEdit.intensity, 300);

const priorityFixtures = [
  { unit: 'min/km' as const, distanceM: 2000, durationS: 600, intensity: 300 },
  { unit: 'min/100m' as const, distanceM: 500, durationS: 600, intensity: 120 },
  { unit: 'km/h' as const, distanceM: 36000, durationS: 3600, intensity: 36 },
];

for (const fixture of priorityFixtures) {
  const distanceIsDerived = deriveEnduranceMetricValues(
    { ...fixture, durationS: fixture.durationS * 2, intensity: fixture.intensity },
    fixture.unit,
    'duration',
  );
  assert.equal(distanceIsDerived.distanceM, fixture.distanceM * 2);
  assert.equal(distanceIsDerived.intensity, fixture.intensity);
  assert.equal(distanceIsDerived.durationS, fixture.durationS * 2);

  const intensityIsDerived = deriveEnduranceMetricValues(
    { ...fixture, durationS: fixture.durationS * 2, intensity: fixture.intensity },
    fixture.unit,
    'duration',
    ['duration', 'distance', 'intensity'],
  );
  assert.equal(intensityIsDerived.distanceM, fixture.distanceM);
  assert.equal(intensityIsDerived.intensity, fixture.unit === 'km/h' ? fixture.intensity / 2 : fixture.intensity * 2);

  const durationIsDerived = deriveEnduranceMetricValues(
    { ...fixture, distanceM: fixture.distanceM * 2 },
    fixture.unit,
    'distance',
    ['intensity', 'distance', 'duration'],
  );
  assert.equal(durationIsDerived.distanceM, fixture.distanceM * 2);
  assert.equal(durationIsDerived.intensity, fixture.intensity);
}
