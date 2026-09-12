import assert from 'node:assert/strict';
import {
  addAdvancedGroup,
  addAdvancedSection,
  buildKilometerSections,
  calculateAdvancedTotals,
  buildAdvancedSessionTimestamps,
  deriveAdvancedSectionMetrics,
  deriveKilometerSectionMetrics,
  collapseGroupRepetitions,
  createEmptyAdvancedSection,
  expandGroupRepetitions,
  hasValidAdvancedSection,
  hasValidKilometerSections,
  insertAdvancedSectionsAfterSubtree,
  materializeTemplateSections,
  removeAdvancedSection,
  serializeAdvancedSections,
  sortByOrderIndex,
  type AdvancedSectionDraft,
} from './advancedEnduranceSession.helper';
import type { EnduranceMetricField, EnduranceMetricPriority } from './enduranceMetricPriority.helper';

const allMetricPriorities: EnduranceMetricPriority[] = [
  ['intensity', 'duration', 'distance'],
  ['intensity', 'distance', 'duration'],
  ['duration', 'intensity', 'distance'],
  ['duration', 'distance', 'intensity'],
  ['distance', 'intensity', 'duration'],
  ['distance', 'duration', 'intensity'],
];

const templateSections = materializeTemplateSections([
  {
    id: 'warmup',
    parent_step_id: null,
    order_index: 0,
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
    order_index: 1,
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
    order_index: 0,
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
    order_index: 1,
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

const unorderedTemplateSections = materializeTemplateSections([
  {
    id: 'cooldown',
    parent_step_id: null,
    order_index: 4,
    is_group: false,
    phase_type: 'cooldown',
    duration_type: 'distance',
    duration_s: null,
    distance_m: 1000,
    repetitions: 1,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
  {
    id: 'group',
    parent_step_id: null,
    order_index: 1,
    is_group: true,
    phase_type: 'interval',
    duration_type: 'lap_button',
    duration_s: null,
    distance_m: null,
    repetitions: 2,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
  {
    id: 'recovery-child',
    parent_step_id: 'group',
    order_index: 1,
    is_group: false,
    phase_type: 'recovery',
    duration_type: 'time',
    duration_s: 60,
    distance_m: null,
    repetitions: 1,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
  {
    id: 'warmup',
    parent_step_id: null,
    order_index: 0,
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
    id: 'work-child',
    parent_step_id: 'group',
    order_index: 0,
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
]);
assert.deepEqual(
  unorderedTemplateSections.map(section => section.clientId),
  ['warmup', 'group', 'work-child', 'recovery-child', 'cooldown'],
);

assert.deepEqual(
  sortByOrderIndex([
    { id: 'second', order_index: 1 },
    { id: 'first-tied', order_index: 0 },
    { id: 'second-tied', order_index: 0 },
  ]).map(item => item.id),
  ['first-tied', 'second-tied', 'second'],
);

const nestedTemplateSections = materializeTemplateSections([
  {
    id: 'grandchild',
    parent_step_id: 'child',
    order_index: 0,
    is_group: false,
    phase_type: 'interval',
    duration_type: 'time',
    duration_s: 30,
    distance_m: null,
    repetitions: 1,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
  {
    id: 'sibling',
    parent_step_id: null,
    order_index: 1,
    is_group: false,
    phase_type: 'cooldown',
    duration_type: 'time',
    duration_s: 60,
    distance_m: null,
    repetitions: 1,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
  {
    id: 'parent',
    parent_step_id: null,
    order_index: 0,
    is_group: true,
    phase_type: 'interval',
    duration_type: 'lap_button',
    duration_s: null,
    distance_m: null,
    repetitions: 1,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
  {
    id: 'child',
    parent_step_id: 'parent',
    order_index: 0,
    is_group: true,
    phase_type: 'interval',
    duration_type: 'lap_button',
    duration_s: null,
    distance_m: null,
    repetitions: 1,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
]);
assert.deepEqual(
  nestedTemplateSections.map(section => section.clientId),
  ['parent', 'child', 'grandchild', 'sibling'],
);

const orderedSerializedSections = serializeAdvancedSections([
  unorderedTemplateSections[1],
  unorderedTemplateSections[2],
  unorderedTemplateSections[4],
]);
assert.deepEqual(
  orderedSerializedSections.map(section => section.orderIndex),
  [0, 1, 2],
);

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

const positionedGroupSections = materializeTemplateSections([
  {
    id: 'late',
    parent_step_id: null,
    order_index: 2,
    is_group: false,
    phase_type: 'cooldown',
    duration_type: 'time',
    duration_s: 60,
    distance_m: null,
    repetitions: 1,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
  {
    id: 'positioned-group',
    parent_step_id: null,
    order_index: 0,
    is_group: true,
    phase_type: 'interval',
    duration_type: 'lap_button',
    duration_s: null,
    distance_m: null,
    repetitions: 2,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
  {
    id: 'positioned-child',
    parent_step_id: 'positioned-group',
    order_index: 0,
    is_group: false,
    phase_type: 'interval',
    duration_type: 'distance',
    duration_s: null,
    distance_m: 400,
    repetitions: 1,
    target_type: 'none',
    target_min: null,
    target_max: null,
  },
]);
const positionedExpanded = expandGroupRepetitions(positionedGroupSections, 'positioned-group');
assert.deepEqual(
  positionedExpanded.map(section => section.clientId),
  ['positioned-group', 'positioned-child-rep-1', 'positioned-child-rep-2', 'late'],
);
assert.deepEqual(
  collapseGroupRepetitions(positionedExpanded, 'positioned-group').map(section => section.clientId),
  ['positioned-group', 'positioned-child', 'late'],
);

const fractionalRunningDuration = deriveAdvancedSectionMetrics(
  { ...createEmptyAdvancedSection('fractional'), distanceM: 1500, paceSPerKm: 285 },
  'running',
);
assert.equal(fractionalRunningDuration.durationS, 428);

assert.deepEqual(
  insertAdvancedSectionsAfterSubtree(positionedGroupSections, 'positioned-group', [
    createEmptyAdvancedSection('new-child', 'positioned-group'),
  ]).map(section => section.clientId),
  ['positioned-group', 'positioned-child', 'new-child', 'late'],
);

const withEmpty = addAdvancedSection([], 'step-1');
assert.equal(withEmpty.length, 1);
assert.equal(hasValidAdvancedSection(withEmpty), false);
const validStep = { ...withEmpty[0], distanceM: 1000, durationS: 360 };
assert.equal(hasValidAdvancedSection([validStep]), true);

const withGroup = addAdvancedGroup([], 'group-1', 'child-1');
assert.equal(withGroup.length, 2);

const kilometerSections = buildKilometerSections(12300);
assert.deepEqual(
  kilometerSections.map(section => section.distanceM),
  [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 300],
);
assert.equal(
  kilometerSections.every(section => section.sourceTemplateStepId === null),
  true,
);
assert.equal(
  kilometerSections.every(section => section.durationS === null),
  true,
);

const timedKilometers = kilometerSections.map((section, index) => ({
  ...section,
  durationS: index < 8 ? 300 + index : null,
}));
const resizedKilometers = buildKilometerSections(8300, timedKilometers);
assert.deepEqual(
  resizedKilometers.map(section => section.durationS),
  [300, 301, 302, 303, 304, 305, 306, 307, null],
);

const fixedDistanceRun = deriveKilometerSectionMetrics({ ...resizedKilometers[0], durationS: 330 }, 'running');
assert.equal(fixedDistanceRun.distanceM, 1000);
assert.equal(fixedDistanceRun.durationS, 330);
assert.equal(fixedDistanceRun.paceSPerKm, 330);

const fixedDistanceSwim = deriveKilometerSectionMetrics(
  { ...resizedKilometers[0], distanceM: 300, durationS: 180 },
  'swimming',
);
assert.equal(fixedDistanceSwim.distanceM, 300);
assert.equal(fixedDistanceSwim.paceSPer100m, 60);
assert.equal(hasValidKilometerSections(resizedKilometers), false);
assert.equal(hasValidKilometerSections(resizedKilometers.map(section => ({ ...section, durationS: 300 }))), true);
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

const repeatedTotals = calculateAdvancedTotals([
  {
    ...createEmptyAdvancedSection('repeat-group'),
    isGroup: true,
    durationType: 'lap_button',
    repetitions: 4,
  },
  {
    ...createEmptyAdvancedSection('repeat-work', 'repeat-group'),
    distanceM: 400,
    durationS: 120,
  },
]);
assert.equal(repeatedTotals.distanceM, 1600);
assert.equal(repeatedTotals.durationS, 480);

const expandedRepeatedTotals = calculateAdvancedTotals([
  {
    ...createEmptyAdvancedSection('expanded-group'),
    isGroup: true,
    durationType: 'lap_button',
    repetitions: 2,
  },
  {
    ...createEmptyAdvancedSection('expanded-1', 'expanded-group'),
    repetitionIndex: 1,
    distanceM: 400,
    durationS: 120,
  },
  {
    ...createEmptyAdvancedSection('expanded-2', 'expanded-group'),
    repetitionIndex: 2,
    distanceM: 500,
    durationS: 130,
  },
]);
assert.equal(expandedRepeatedTotals.distanceM, 900);
assert.equal(expandedRepeatedTotals.durationS, 250);

const distanceOnlyTimestamps = buildAdvancedSessionTimestamps('2026-01-15', '10:00', 0);
assert.equal(distanceOnlyTimestamps.endTime, distanceOnlyTimestamps.startTime);
assert.equal(distanceOnlyTimestamps.startedAtLocal, '2026-01-15T10:00:00');
assert.equal(distanceOnlyTimestamps.endedAtLocal, '2026-01-15T10:00:00');

const durationTimestamps = buildAdvancedSessionTimestamps('2026-01-15', '10:00', 3600);
assert.equal(durationTimestamps.endedAtLocal, '2026-01-15T11:00:00');

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

const runningByTimeAndPace = deriveAdvancedSectionMetrics(
  {
    ...createEmptyAdvancedSection('running-derived'),
    durationS: 600,
    paceSPerKm: 600,
  },
  'running',
);
assert.equal(runningByTimeAndPace.distanceM, 1000);

const runningByDistanceAndPace = deriveAdvancedSectionMetrics(
  {
    ...createEmptyAdvancedSection('running-duration'),
    distanceM: 2000,
    paceSPerKm: 300,
  },
  'running',
);
assert.equal(runningByDistanceAndPace.durationS, 600);

const runningByTimeAndDistance = deriveAdvancedSectionMetrics(
  {
    ...createEmptyAdvancedSection('running-pace'),
    durationS: 600,
    distanceM: 2000,
  },
  'running',
);
assert.equal(runningByTimeAndDistance.paceSPerKm, 300);

const editedRunning = deriveAdvancedSectionMetrics(
  {
    ...runningByTimeAndDistance,
    durationS: 300,
  },
  'running',
  'duration',
);
assert.equal(editedRunning.distanceM, 1000);
assert.equal(editedRunning.paceSPerKm, 300);

const editedDistance = deriveAdvancedSectionMetrics(
  {
    ...runningByTimeAndDistance,
    distanceM: 1000,
  },
  'running',
  'distance',
);
assert.equal(editedDistance.distanceM, 1000);
assert.equal(editedDistance.paceSPerKm, 300);
assert.equal(editedDistance.durationS, 300);

const editedIntensity = deriveAdvancedSectionMetrics(
  {
    ...runningByTimeAndDistance,
    paceSPerKm: 600,
  },
  'running',
  'intensity',
);
assert.equal(editedIntensity.distanceM, 1000);
assert.equal(editedIntensity.durationS, 600);
assert.equal(editedIntensity.paceSPerKm, 600);

const distanceMayBeDerivedOnlyWhenEmpty = deriveAdvancedSectionMetrics(
  {
    ...createEmptyAdvancedSection('running-distance-empty'),
    durationS: 600,
    paceSPerKm: 600,
  },
  'running',
  'intensity',
);
assert.equal(distanceMayBeDerivedOnlyWhenEmpty.distanceM, 1000);

const editedDistanceKeepsUserDistance = deriveAdvancedSectionMetrics(
  {
    ...runningByTimeAndDistance,
    distanceM: 1000,
  },
  'running',
  'distance',
);
assert.equal(editedDistanceKeepsUserDistance.distanceM, 1000);
assert.equal(editedDistanceKeepsUserDistance.paceSPerKm, 300);
assert.equal(editedDistanceKeepsUserDistance.durationS, 300);

const customPriorityAdvanced = deriveAdvancedSectionMetrics(
  {
    ...runningByTimeAndDistance,
    durationS: 900,
    paceSPerKm: 300,
  },
  'running',
  'duration',
  ['intensity', 'distance', 'duration'],
);
assert.equal(customPriorityAdvanced.distanceM, 3000);
assert.equal(customPriorityAdvanced.paceSPerKm, 300);

const cyclingEditedDuration = deriveAdvancedSectionMetrics(
  {
    ...createEmptyAdvancedSection('cycling-edited-duration'),
    distanceM: 36_000,
    durationS: 7_200,
    speedMPerS: 10,
  },
  'cycling',
  'duration',
);
assert.equal(cyclingEditedDuration.distanceM, 72_000);
assert.equal(cyclingEditedDuration.speedMPerS, 10);

const swimmingEditedIntensity = deriveAdvancedSectionMetrics(
  {
    ...createEmptyAdvancedSection('swimming-edited-intensity'),
    distanceM: 500,
    durationS: 600,
    paceSPer100m: 100,
  },
  'swimming',
  'intensity',
);
assert.equal(swimmingEditedIntensity.distanceM, 600);
assert.equal(swimmingEditedIntensity.durationS, 600);

const cyclingDerived = deriveAdvancedSectionMetrics(
  {
    ...createEmptyAdvancedSection('cycling-derived'),
    durationS: 3600,
    speedMPerS: 5,
  },
  'cycling',
);
assert.equal(cyclingDerived.distanceM, 18_000);

const swimmingDerived = deriveAdvancedSectionMetrics(
  {
    ...createEmptyAdvancedSection('swimming-derived'),
    durationS: 120,
    distanceM: 100,
  },
  'swimming',
);
assert.equal(swimmingDerived.paceSPer100m, 120);

const getAdvancedMetricValue = (section: AdvancedSectionDraft, field: EnduranceMetricField): number | null =>
  field === 'distance' ? section.distanceM : field === 'duration' ? section.durationS : section.paceSPerKm;

const calculateExpectedRunningMetric = (section: AdvancedSectionDraft, field: EnduranceMetricField): number => {
  if (field === 'distance') return ((section.durationS ?? 0) / (section.paceSPerKm ?? 1)) * 1000;
  if (field === 'duration') return Math.round(((section.distanceM ?? 0) / 1000) * (section.paceSPerKm ?? 0));
  return (section.durationS ?? 0) / ((section.distanceM ?? 1) / 1000);
};

for (const priority of allMetricPriorities) {
  for (const changedField of ['intensity', 'duration', 'distance'] as const) {
    const fieldKey =
      changedField === 'distance' ? 'distanceM' : changedField === 'duration' ? 'durationS' : 'paceSPerKm';
    const input: AdvancedSectionDraft = {
      ...createEmptyAdvancedSection(`priority-${priority.join('-')}-${changedField}`),
      distanceM: changedField === 'distance' ? 3000 : 2000,
      durationS: changedField === 'duration' ? 900 : 600,
      paceSPerKm: changedField === 'intensity' ? 600 : 300,
    };
    const result = deriveAdvancedSectionMetrics(
      { ...input, [fieldKey]: input[fieldKey] },
      'running',
      changedField,
      priority,
    );
    const targetField = changedField === priority[2] ? priority[1] : priority[2];

    assert.equal(getAdvancedMetricValue(result, targetField), calculateExpectedRunningMetric(input, targetField));
    for (const field of ['intensity', 'duration', 'distance'] as const) {
      if (field !== targetField)
        assert.equal(getAdvancedMetricValue(result, field), getAdvancedMetricValue(input, field));
    }
  }
}

for (const missingField of ['intensity', 'duration', 'distance'] as const) {
  const input: AdvancedSectionDraft = {
    ...createEmptyAdvancedSection(`missing-${missingField}`),
    distanceM: missingField === 'distance' ? null : 2000,
    durationS: missingField === 'duration' ? null : 600,
    paceSPerKm: missingField === 'intensity' ? null : 300,
  };
  const result = deriveAdvancedSectionMetrics(input, 'running');
  assert.equal(
    getAdvancedMetricValue(result, missingField),
    calculateExpectedRunningMetric({ ...input, distanceM: 2000, durationS: 600, paceSPerKm: 300 }, missingField),
  );
}
