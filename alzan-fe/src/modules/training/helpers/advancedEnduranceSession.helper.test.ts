import assert from 'node:assert/strict';
import {
  addAdvancedGroup,
  addAdvancedSection,
  calculateAdvancedTotals,
  collapseGroupRepetitions,
  createEmptyAdvancedSection,
  expandGroupRepetitions,
  hasValidAdvancedSection,
  materializeTemplateSections,
  removeAdvancedSection,
} from './advancedEnduranceSession.helper';

const templateSections = materializeTemplateSections([
  {
    id: 'warmup',
    parent_step_id: null,
    is_group: false,
    phase_type: 'warmup',
    duration_type: 'time',
    duration_s: 300,
    distance_m: null,
    repetitions: 1,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
  {
    id: 'repeats',
    parent_step_id: null,
    is_group: true,
    phase_type: 'interval',
    duration_type: 'lap_button',
    duration_s: null,
    distance_m: null,
    repetitions: 4,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
  {
    id: 'work',
    parent_step_id: 'repeats',
    is_group: false,
    phase_type: 'interval',
    duration_type: 'distance',
    duration_s: null,
    distance_m: 400,
    repetitions: 1,
    target_type: 'pace',
    target_min: 270,
    target_max: 285,
  },
  {
    id: 'recovery',
    parent_step_id: 'repeats',
    is_group: false,
    phase_type: 'recovery',
    duration_type: 'time',
    duration_s: 90,
    distance_m: null,
    repetitions: 1,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
]);

assert.equal(templateSections.length, 4);
assert.equal(templateSections.find(section => section.clientId === 'repeats')?.repetitions, 4);
assert.equal(templateSections.find(section => section.clientId === 'work')?.paceSPerKm, 270);

const expanded = expandGroupRepetitions(
  templateSections.map(section => ({ ...section, distanceM: section.clientId === 'work' ? 400 : section.distanceM })),
  'repeats',
);
assert.equal(expanded.filter(section => section.parentClientId === 'repeats').length, 8);
assert.equal(expanded.filter(section => section.repetitionIndex === 4).length, 2);

const collapsed = collapseGroupRepetitions(expanded, 'repeats');
assert.equal(collapsed.filter(section => section.parentClientId === 'repeats').length, 2);
assert.equal(
  collapsed.some(section => section.repetitionIndex != null),
  false,
);

const withEmpty = addAdvancedSection([], 'step-1');
assert.equal(withEmpty.length, 1);
assert.equal(hasValidAdvancedSection(withEmpty), false);
const validStep = { ...withEmpty[0], distanceM: 1000, durationS: 360 };
assert.equal(hasValidAdvancedSection([validStep]), true);

const withGroup = addAdvancedGroup([], 'group-1', 'child-1');
assert.equal(withGroup.length, 2);
assert.equal(withGroup.find(section => section.clientId === 'child-1')?.parentClientId, 'group-1');
assert.equal(removeAdvancedSection(withGroup, 'group-1').length, 0);

const totals = calculateAdvancedTotals([
  createEmptyAdvancedSection('warmup'),
  { ...createEmptyAdvancedSection('work'), distanceM: 400, durationS: 120 },
  { ...createEmptyAdvancedSection('recovery'), durationS: 90 },
  { ...createEmptyAdvancedSection('cooldown'), distanceM: 1000, durationS: 360 },
]);
assert.deepEqual(totals, {
  distanceM: 1400,
  durationS: 570,
  paceSPerKm: 407.14285714285717,
  paceSPer100m: 40.714285714285715,
  speedMPerS: 2.456140350877193,
});

const swimmingTotals = calculateAdvancedTotals([
  { ...createEmptyAdvancedSection('swim-1'), distanceM: 500, durationS: 600, paceSPer100m: 120 },
  { ...createEmptyAdvancedSection('swim-2'), distanceM: 500, durationS: null, paceSPer100m: null },
]);
assert.equal(swimmingTotals.distanceM, 1000);
assert.equal(swimmingTotals.durationS, 600);
assert.equal(swimmingTotals.paceSPer100m, 60);

const cyclingTotals = calculateAdvancedTotals([
  { ...createEmptyAdvancedSection('ride'), distanceM: 20_000, durationS: 3_600, speedMPerS: 5.55 },
]);
assert.equal(cyclingTotals.distanceM, 20_000);
assert.equal(cyclingTotals.durationS, 3_600);
assert.equal(cyclingTotals.speedMPerS, 20_000 / 3_600);
