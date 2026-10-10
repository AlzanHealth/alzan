import assert from 'node:assert/strict';
import {
  getPracticedCardioSports,
  isSameCardioSportSubtype,
  normalizeCardioSportSubtype,
  normalizeCardioSportType,
} from './cardioSportNormalization';

const activities = [
  { sport_type: 'running', sport_subtype: null, start_time: '2026-10-01T10:00:00.000Z' },
  { sport_type: 'running', sport_subtype: 'outdoor', start_time: '2026-10-03T10:00:00.000Z' },
  { sport_type: 'strength', sport_subtype: null, start_time: '2026-10-05T10:00:00.000Z' },
  { sport_type: 'gym', sport_subtype: 'indoor', start_time: '2026-10-07T10:00:00.000Z' },
  { sport_type: 'cycling', sport_subtype: 'indoor_trainer', start_time: '2026-10-04T10:00:00.000Z' },
];

assert.equal(normalizeCardioSportType('running_outdoor', null), 'running');
assert.equal(normalizeCardioSportType('strength', null), 'gym');
assert.equal(normalizeCardioSportType('gym', 'indoor'), 'gym');
assert.equal(normalizeCardioSportSubtype('strength', 'indoor_strength'), 'gym');
assert.equal(normalizeCardioSportSubtype('gym', 'indoor'), 'gym');
assert.equal(normalizeCardioSportType('other', 'urban_walk'), 'hiking');
assert.equal(normalizeCardioSportType('trail_running', null), 'trail');
assert.equal(normalizeCardioSportType('running', 'trail'), 'trail');
assert.equal(normalizeCardioSportSubtype('trail_running', null), 'trail');
assert.equal(normalizeCardioSportSubtype('running_outdoor', null), 'outdoor');
assert.equal(
  isSameCardioSportSubtype(
    { sport_type: 'running', sport_subtype: 'road' },
    { sport_type: 'running_outdoor', sport_subtype: null },
  ),
  true,
);
assert.equal(
  isSameCardioSportSubtype(
    { sport_type: 'running', sport_subtype: 'trail' },
    { sport_type: 'trail_running', sport_subtype: null },
  ),
  true,
);
assert.equal(
  isSameCardioSportSubtype(
    { sport_type: 'cycling', sport_subtype: 'indoor' },
    { sport_type: 'cycling', sport_subtype: 'outdoor' },
  ),
  false,
);
assert.deepEqual(
  getPracticedCardioSports(activities).map(option => option.sportType),
  ['gym', 'cycling', 'running'],
);
