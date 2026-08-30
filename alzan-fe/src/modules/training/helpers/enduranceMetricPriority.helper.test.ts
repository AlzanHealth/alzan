import assert from 'node:assert/strict';
import { deriveEnduranceMetricValues } from './enduranceMetricPriority.helper';

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
assert.equal(editedDuration.distanceM, 2000);
assert.equal(editedDuration.intensity, 150);

const editedIntensity = deriveEnduranceMetricValues(
  { distanceM: 2000, durationS: 600, intensity: 600 },
  'min/km',
  'intensity',
);
assert.equal(editedIntensity.distanceM, 2000);
assert.equal(editedIntensity.durationS, 1200);

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
