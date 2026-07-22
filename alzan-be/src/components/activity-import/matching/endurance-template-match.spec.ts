import { strict as assert } from 'assert';
import {
  ActivityLapLike,
  buildActivityTotals,
  buildTemplateTotals,
  countComparableTotalSignals,
  countComparableStructuralSignals,
  deriveActivityStructure,
  deriveTemplateDistanceMatchedActivityStructure,
  deriveTemplateStructure,
  EnduranceStepLike,
  POSSIBLE_MATCH,
  scoreStructuralMatch,
  scoreTotalsMatch,
  STRONG_MATCH,
  isMatchMarginSufficient,
  templateHasRecoveryPhases,
} from './endurance-template-match';

function lap(distanceM: number, durationSeconds: number): ActivityLapLike {
  return { distanceM, durationSeconds, avgPaceSecondsPerKm: (durationSeconds / distanceM) * 1000 };
}

function autoLap(distanceM: number, durationSeconds: number): ActivityLapLike {
  return { ...lap(distanceM, durationSeconds), lapType: 'distance' };
}

function intervalLaps(reps: number, repDistanceM: number, repDurationS: number, recoveryS: number): ActivityLapLike[] {
  const laps: ActivityLapLike[] = [];
  for (let index = 0; index < reps; index += 1) {
    laps.push(lap(repDistanceM, repDurationS));
    laps.push(lap(200, recoveryS));
  }
  return laps;
}

function mixedDistanceTemplateSteps(): EnduranceStepLike[] {
  return [
    ...templateSteps(4, 400, 240, 90),
    {
      id: 'group-2',
      parentStepId: null,
      isGroup: true,
      repetitions: 2,
      orderIndex: 1,
      phaseType: 'interval',
      durationType: 'distance',
      durationS: null,
      distanceM: null,
      targetType: null,
      targetMin: null,
      targetMax: null,
    },
    {
      id: 'work-2',
      parentStepId: 'group-2',
      isGroup: false,
      repetitions: null,
      orderIndex: 0,
      phaseType: 'interval',
      durationType: 'distance',
      durationS: null,
      distanceM: 800,
      targetType: 'pace',
      targetMin: 250,
      targetMax: 250,
    },
    {
      id: 'rec-2',
      parentStepId: 'group-2',
      isGroup: false,
      repetitions: null,
      orderIndex: 1,
      phaseType: 'recovery',
      durationType: 'time',
      durationS: 120,
      distanceM: null,
      targetType: null,
      targetMin: null,
      targetMax: null,
    },
  ];
}

function templateSteps(
  reps: number,
  repDistanceM: number,
  paceSecPerKm: number,
  recoveryS: number,
): EnduranceStepLike[] {
  const steps: EnduranceStepLike[] = [
    {
      id: 'group-1',
      parentStepId: null,
      isGroup: true,
      repetitions: reps,
      orderIndex: 0,
      phaseType: 'interval',
      durationType: 'distance',
      durationS: null,
      distanceM: null,
      targetType: null,
      targetMin: null,
      targetMax: null,
    },
    {
      id: 'work-1',
      parentStepId: 'group-1',
      isGroup: false,
      repetitions: null,
      orderIndex: 0,
      phaseType: 'interval',
      durationType: 'distance',
      durationS: null,
      distanceM: repDistanceM,
      targetType: 'pace',
      targetMin: paceSecPerKm,
      targetMax: paceSecPerKm,
    },
    {
      id: 'rec-1',
      parentStepId: 'group-1',
      isGroup: false,
      repetitions: null,
      orderIndex: 1,
      phaseType: 'recovery',
      durationType: 'time',
      durationS: recoveryS,
      distanceM: null,
      targetType: null,
      targetMin: null,
      targetMax: null,
    },
  ];
  return steps;
}

function boundedTemplateSteps(
  reps: number,
  repDistanceM: number,
  paceSecPerKm: number,
  recoveryS: number,
  warmupS = 900,
  cooldownS = 600,
): EnduranceStepLike[] {
  return [
    {
      id: 'warmup',
      parentStepId: null,
      isGroup: false,
      repetitions: null,
      orderIndex: 0,
      phaseType: 'warmup',
      durationType: 'time',
      durationS: warmupS,
      distanceM: null,
      targetType: null,
      targetMin: null,
      targetMax: null,
    },
    ...templateSteps(reps, repDistanceM, paceSecPerKm, recoveryS).map(step =>
      step.parentStepId == null ? { ...step, orderIndex: 1 } : step,
    ),
    {
      id: 'cooldown',
      parentStepId: null,
      isGroup: false,
      repetitions: null,
      orderIndex: 2,
      phaseType: 'cooldown',
      durationType: 'time',
      durationS: cooldownS,
      distanceM: null,
      targetType: null,
      targetMin: null,
      targetMax: null,
    },
  ];
}

function exactSuuntoWorkoutLaps(): ActivityLapLike[] {
  return [
    lap(1477.4, 600),
    lap(1000, 294.4),
    lap(190.1, 120),
    lap(1000, 284.4),
    lap(163.1, 120),
    lap(1000, 286.7),
    lap(173.1, 120),
    lap(1000, 289.6),
    lap(171, 120),
    lap(1525.9, 600),
    lap(36, 13.6),
  ];
}

function assertExactSuuntoWorkoutMatchesCompleteTemplateSequence(): void {
  const steps = boundedTemplateSteps(4, 1000, 280, 120);
  const activityStructure = deriveTemplateDistanceMatchedActivityStructure(exactSuuntoWorkoutLaps(), steps);
  assert.ok(activityStructure, 'expected complete ordered Suunto interval structure');
  assert.equal(activityStructure.repCount, 4);
  assert.equal(activityStructure.recoveryDurationS, 120);
  assert.equal(activityStructure.alignment?.isAutoMatchEligible, true);
  assert.deepEqual(activityStructure.alignment?.matchedLapIndexes, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(activityStructure.alignment?.extraLapIndexes, [10]);
  const templateStructure = deriveTemplateStructure(steps);
  assert.ok(templateStructure);
  assert.ok(scoreStructuralMatch(activityStructure, templateStructure) >= STRONG_MATCH);
}

function boundedActivityLaps(reps: number, repDurationS = 290): ActivityLapLike[] {
  return [lap(1477, 600), ...intervalLaps(reps, 1000, repDurationS, 120), lap(1526, 600)];
}

function assertPaceIsLaxWhenCompleteStructureMatches(): void {
  const steps = boundedTemplateSteps(4, 1000, 280, 120);
  const activityStructure = deriveTemplateDistanceMatchedActivityStructure(boundedActivityLaps(4, 420), steps);
  assert.ok(activityStructure);
  const templateStructure = deriveTemplateStructure(steps);
  assert.ok(templateStructure);
  assert.ok(scoreStructuralMatch(activityStructure, templateStructure) >= STRONG_MATCH);
}

function assertBoundaryDifferenceAboveFortyPercentRejectsStructure(): void {
  const steps = boundedTemplateSteps(4, 1000, 280, 120);
  const laps = [lap(1200, 500), ...intervalLaps(4, 1000, 290, 120), lap(1526, 600)];
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(laps, steps), null);
}

function assertOneRepetitionDifferenceOnlyProducesSuggestion(): void {
  const steps = boundedTemplateSteps(4, 1000, 280, 120);
  const templateStructure = deriveTemplateStructure(steps);
  assert.ok(templateStructure);
  for (const reps of [3, 5]) {
    const activityStructure = deriveTemplateDistanceMatchedActivityStructure(boundedActivityLaps(reps), steps);
    assert.ok(activityStructure, `expected template-aware suggestion for ${reps} reps`);
    assert.equal(activityStructure.repCount, reps);
    assert.equal(activityStructure.alignment?.isAutoMatchEligible, false);
    const score = scoreStructuralMatch(activityStructure, templateStructure);
    assert.ok(
      score >= POSSIBLE_MATCH && score < STRONG_MATCH,
      `expected suggestion score for ${reps} reps, got ${score}`,
    );
  }
}

function assertMoreThanOneRepetitionDifferenceHasNoTemplateAlignment(): void {
  const steps = boundedTemplateSteps(4, 1000, 280, 120);
  for (const reps of [2, 6]) {
    assert.equal(
      deriveTemplateDistanceMatchedActivityStructure(boundedActivityLaps(reps), steps),
      null,
      `expected no structural alignment for ${reps} observed reps versus 4 planned`,
    );
  }
}

function assertMissingFinalRecoveryCannotBecomeShorterWorkoutSuggestion(): void {
  const steps = boundedTemplateSteps(4, 1000, 280, 120);
  const laps = boundedActivityLaps(4);
  laps.splice(laps.length - 2, 1);
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(laps, steps), null);
}

function assertExactIntervalsAreStrongStructuralMatch(): void {
  // Activity: 6 x 400m at 90s (3:45/km) with 90s recoveries.
  const activityStructure = deriveActivityStructure(intervalLaps(6, 400, 90, 90));
  assert.ok(activityStructure, 'expected interval structure to be detected');
  assert.equal(activityStructure.repCount, 6);
  const template = deriveTemplateStructure(templateSteps(6, 400, 225, 90));
  assert.ok(template, 'expected template structure');
  assert.equal(template.repCount, 6);
  const score = scoreStructuralMatch(activityStructure, template);
  assert.ok(score >= STRONG_MATCH, `expected strong structural match, got ${score}`);
}

function assertOneExtraRepIsOnlyPossibleMatch(): void {
  // One repetition of difference may be suggested, but never auto-associated.
  const activityStructure = deriveActivityStructure(intervalLaps(7, 400, 90, 90));
  assert.ok(activityStructure);
  assert.equal(activityStructure.repCount, 7);
  const template = deriveTemplateStructure(templateSteps(6, 400, 225, 90));
  assert.ok(template);
  const score = scoreStructuralMatch(activityStructure, template);
  assert.ok(score >= POSSIBLE_MATCH && score < STRONG_MATCH, `expected possible match for 7 vs 6 reps, got ${score}`);
}

function assertTwoExtraRepsAreNoStructuralMatch(): void {
  // More than one repetition of difference is not a structural match.
  const activityStructure = deriveActivityStructure(intervalLaps(8, 400, 90, 90));
  assert.ok(activityStructure);
  const template = deriveTemplateStructure(templateSteps(6, 400, 225, 90));
  assert.ok(template);
  const score = scoreStructuralMatch(activityStructure, template);
  assert.ok(score < POSSIBLE_MATCH, `expected no structural match for 8 vs 6 reps, got ${score}`);
}

function assertDifferentWorkoutIsNoStructuralMatch(): void {
  // 10 x 1000m vs planned 6 x 400m -> no match.
  const activityStructure = deriveActivityStructure(intervalLaps(10, 1000, 240, 120));
  assert.ok(activityStructure);
  const template = deriveTemplateStructure(templateSteps(6, 400, 225, 90));
  assert.ok(template);
  const score = scoreStructuralMatch(activityStructure, template);
  assert.ok(score < POSSIBLE_MATCH, `expected no match (<60), got ${score}`);
}

function assertStructuralSignalsOnlyCountComparableValues(): void {
  assert.equal(
    countComparableStructuralSignals(
      { repCount: 5, repDistanceM: null, repPaceSecPerKm: null, recoveryDurationS: null },
      { repCount: 5, repDistanceM: null, repPaceSecPerKm: null, recoveryDurationS: null },
    ),
    1,
  );
  assert.equal(
    countComparableStructuralSignals(
      { repCount: 5, repDistanceM: 400, repPaceSecPerKm: null, recoveryDurationS: null },
      { repCount: 5, repDistanceM: 400, repPaceSecPerKm: 240, recoveryDurationS: 90 },
    ),
    2,
  );
}

function assertSteadyAutolapsProduceNoStructure(): void {
  // Steady 10k with uniform 1km autolaps: no interval structure.
  const laps: ActivityLapLike[] = [];
  for (let index = 0; index < 10; index += 1) laps.push(lap(1000, 300 + (index % 2)));
  assert.equal(deriveActivityStructure(laps), null);
}

function assertRecoveryMustAppearBetweenEveryWorkPair(): void {
  const laps = [lap(1000, 240), lap(1000, 242), lap(200, 120), lap(1000, 241)];
  assert.equal(deriveActivityStructure(laps), null);
}

function assertContinuousAutolapsCannotMatchRecoveryTemplate(): void {
  const laps = [lap(1000, 300), lap(1000, 301), lap(1000, 299), lap(1000, 300)];
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(laps, templateSteps(4, 1000, 300, 120)), null);
}

function assertUniformAutolapsCannotImitateTimeRecoveries(): void {
  const laps = Array.from({ length: 8 }, () => autoLap(300, 60));
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(laps, templateSteps(4, 300, 200, 60)), null);
}

function assertUniformDistanceAutolapsCannotImitateRecoveriesThroughPaceChanges(): void {
  const laps = Array.from({ length: 8 }, (_, index) => autoLap(300, index % 2 === 0 ? 50 : 60));
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(laps, templateSteps(4, 300, 200, 60)), null);
}

function assertUniformTimeAutolapsCannotImitateDistanceChanges(): void {
  const laps = Array.from({ length: 8 }, (_, index) => ({
    ...lap(index % 2 === 0 ? 300 : 100, 60),
    lapType: 'time',
  }));
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(laps, templateSteps(4, 300, 200, 60)), null);
}

function assertUniformAutolapsAreRejectedBeforeOpenBoundaryAlignment(): void {
  const steps = boundedTemplateSteps(4, 1000, 300, 30).map(step =>
    ['warmup', 'cooldown'].includes(step.phaseType)
      ? { ...step, durationType: 'open', durationS: null, distanceM: null }
      : step,
  );
  const laps = Array.from({ length: 100 }, () => autoLap(1000, 300));
  const startedAt = Date.now();
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(laps, steps), null);
  assert.ok(Date.now() - startedAt < 500, 'uniform autolaps must be rejected before combinatorial alignment');
}

function assertUniformAutolapsCannotImitateIntervalsWithoutRecoveries(): void {
  const steps = templateSteps(4, 300, 200, 60).filter(step => step.phaseType !== 'recovery');
  const laps = Array.from({ length: 4 }, () => autoLap(300, 60));
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(laps, steps), null);
}

function assertRecoveryTemplateIsMarkedAsStrictlyStructured(): void {
  assert.equal(templateHasRecoveryPhases(templateSteps(4, 1000, 300, 120)), true);
  const [step] = templateSteps(1, 1000, 300, 120);
  assert.equal(
    templateHasRecoveryPhases([{ ...step, isGroup: false, parentStepId: null, phaseType: 'warmup' }]),
    false,
  );
}

function assertRecoveryDurationMustMatchTemplate(): void {
  const tooShort = intervalLaps(4, 1000, 300, 90);
  const lowerBoundary = intervalLaps(4, 1000, 300, 110);
  const upperBoundary = intervalLaps(4, 1000, 300, 130);
  const outsideBoundary = intervalLaps(4, 1000, 300, 131);
  const template = templateSteps(4, 1000, 300, 120);
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(tooShort, template), null);
  assert.ok(deriveTemplateDistanceMatchedActivityStructure(lowerBoundary, template));
  assert.ok(deriveTemplateDistanceMatchedActivityStructure(upperBoundary, template));
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(outsideBoundary, template), null);
}

function assertMultipleRecoveryLapsAreSummed(): void {
  const laps = [
    lap(1000, 300),
    lap(100, 60),
    lap(100, 60),
    lap(1000, 300),
    lap(100, 59),
    lap(100, 61),
    lap(1000, 300),
    lap(100, 58),
    lap(100, 62),
  ];
  const structure = deriveTemplateDistanceMatchedActivityStructure(laps, templateSteps(3, 1000, 300, 120));
  assert.ok(structure);
  assert.equal(structure.repCount, 3);
  assert.equal(structure.recoveryDurationS, 120);
}

function assertDistanceRecoveriesMatchWithExistingTolerance(): void {
  const steps = templateSteps(3, 800, 250, 120).map(step =>
    step.phaseType === 'recovery' ? { ...step, durationType: 'distance', durationS: null, distanceM: 250 } : step,
  );
  const matchingLaps = [lap(800, 200), lap(210, 90), lap(800, 201), lap(290, 95), lap(800, 199), lap(250, 92)];
  const outsideTolerance = [...matchingLaps];
  outsideTolerance[3] = lap(301, 95);

  const structure = deriveTemplateDistanceMatchedActivityStructure(matchingLaps, steps);
  assert.ok(structure, 'expected distance recoveries within 20% tolerance to align');
  assert.equal(structure.repCount, 3);
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(outsideTolerance, steps), null);
}

function assertExtraActivityIsOnlyAcceptedOutsideTheTemplate(): void {
  const steps = boundedTemplateSteps(4, 1000, 280, 120);
  const laps = [lap(250, 1000), ...boundedActivityLaps(4), lap(500, 180), lap(100, 40)];
  const structure = deriveTemplateDistanceMatchedActivityStructure(laps, steps);
  assert.ok(structure, 'expected activity before warmup and after cooldown to remain extra');
  assert.deepEqual(structure.alignment?.extraLapIndexes, [0, 11, 12]);

  const lapInsideTemplate = [
    lap(1477, 600),
    lap(1000, 290),
    lap(400, 60),
    lap(200, 120),
    ...intervalLaps(3, 1000, 290, 120),
    lap(1526, 600),
  ];
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(lapInsideTemplate, steps), null);
}

function assertTooFewLapsProduceNoStructure(): void {
  assert.equal(deriveActivityStructure([lap(400, 90), lap(200, 90)]), null);
  assert.equal(deriveActivityStructure([]), null);
}

function assertTemplateDistanceMatchIgnoresWarmupAndCooldown(): void {
  const laps = [
    lap(1600, 600),
    lap(400, 105),
    lap(123, 90),
    lap(400, 109),
    lap(121, 90),
    lap(400, 103),
    lap(130, 90),
    lap(400, 106),
    lap(136, 90),
    lap(400, 108),
    lap(144, 90),
    lap(400, 100),
    lap(150, 90),
    lap(1600, 600),
    lap(675, 234),
  ];
  const activityStructure = deriveTemplateDistanceMatchedActivityStructure(laps, templateSteps(6, 400, 240, 90));
  assert.ok(activityStructure, 'expected template-aware distance structure');
  assert.equal(activityStructure.repCount, 6);
  assert.equal(Math.round(activityStructure.repDistanceM ?? 0), 400);
  const template = deriveTemplateStructure(templateSteps(6, 400, 240, 90));
  assert.ok(template);
  const score = scoreStructuralMatch(activityStructure, template);
  assert.ok(score >= STRONG_MATCH, `expected strong distance-based structural match, got ${score}`);
}

function assertRequiredBoundaryPhasesCannotBeSkipped(): void {
  const boundarySteps: EnduranceStepLike[] = [
    {
      id: 'warmup',
      parentStepId: null,
      isGroup: false,
      repetitions: null,
      orderIndex: -1,
      phaseType: 'warmup',
      durationType: 'open',
      durationS: null,
      distanceM: null,
      targetType: null,
      targetMin: null,
      targetMax: null,
    },
    ...templateSteps(5, 400, 240, 75),
    {
      id: 'cooldown',
      parentStepId: null,
      isGroup: false,
      repetitions: null,
      orderIndex: 2,
      phaseType: 'cooldown',
      durationType: 'open',
      durationS: null,
      distanceM: null,
      targetType: null,
      targetMin: null,
      targetMax: null,
    },
  ];
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(intervalLaps(5, 400, 100, 75), boundarySteps), null);
  assert.ok(
    deriveTemplateDistanceMatchedActivityStructure(
      [lap(1200, 420), ...intervalLaps(5, 400, 100, 75), lap(1000, 400)],
      boundarySteps,
    ),
  );
}

function assertBoundaryPhaseTargetsMustMatch(): void {
  const steps = templateSteps(5, 400, 240, 75);
  steps.push({
    id: 'distance-warmup',
    parentStepId: null,
    isGroup: false,
    repetitions: null,
    orderIndex: -1,
    phaseType: 'warmup',
    durationType: 'distance',
    durationS: null,
    distanceM: 3000,
    targetType: null,
    targetMin: null,
    targetMax: null,
  });
  assert.equal(
    deriveTemplateDistanceMatchedActivityStructure([lap(100, 40), ...intervalLaps(5, 400, 100, 75)], steps),
    null,
  );
  assert.ok(deriveTemplateDistanceMatchedActivityStructure([lap(3000, 900), ...intervalLaps(5, 400, 100, 75)], steps));
}

function assertTemplateDistanceMatchWorksForMultipleDistances(): void {
  const distances = [100, 200, 400, 600, 800, 1000, 1200, 1500, 2000];
  for (const distance of distances) {
    const activityStructure = deriveTemplateDistanceMatchedActivityStructure(
      intervalLaps(5, distance, Math.max(40, distance / 4), 75),
      templateSteps(5, distance, 240, 75),
    );
    assert.ok(activityStructure, `expected structure for ${distance}m intervals`);
    assert.equal(activityStructure.repCount, 5);
    assert.equal(Math.round(activityStructure.repDistanceM ?? 0), distance);
  }
}

function assertShortIntervalsDoNotUseEightyMeterTolerance(): void {
  const structure = deriveTemplateDistanceMatchedActivityStructure(
    intervalLaps(5, 180, 40, 75),
    templateSteps(5, 100, 240, 75),
  );
  assert.equal(structure, null);
}

function assertShortIntervalsAllowTwentyPercentDistanceDifference(): void {
  const structure = deriveTemplateDistanceMatchedActivityStructure(
    intervalLaps(5, 120, 40, 75),
    templateSteps(5, 100, 240, 75),
  );
  assert.ok(structure);
  assert.equal(structure.repCount, 5);
}

function assertTemplateDistanceMatchSupportsMixedBlocks(): void {
  const laps = [
    lap(1200, 420),
    lap(398, 96),
    lap(130, 90),
    lap(407, 98),
    lap(125, 90),
    lap(392, 94),
    lap(135, 90),
    lap(405, 97),
    lap(160, 90),
    lap(790, 198),
    lap(170, 120),
    lap(815, 203),
    lap(170, 120),
    lap(1000, 360),
  ];
  const activityStructure = deriveTemplateDistanceMatchedActivityStructure(laps, mixedDistanceTemplateSteps());
  assert.ok(activityStructure, 'expected mixed interval structure');
  assert.equal(activityStructure.repCount, 6);
  const template = deriveTemplateStructure(mixedDistanceTemplateSteps());
  assert.ok(template);
  const score = scoreStructuralMatch(activityStructure, template);
  assert.ok(score >= STRONG_MATCH, `expected strong mixed structural match, got ${score}`);
}

function assertTemplateDistanceMatchRejectsDifferentSequence(): void {
  const activityStructure = deriveTemplateDistanceMatchedActivityStructure(
    intervalLaps(6, 400, 96, 90),
    mixedDistanceTemplateSteps(),
  );
  assert.equal(activityStructure, null);
}

function assertTwoGroupsCannotEachHideOneExtraRepetition(): void {
  const laps = [...intervalLaps(5, 400, 96, 90), ...intervalLaps(3, 800, 200, 120)];
  assert.equal(deriveTemplateDistanceMatchedActivityStructure(laps, mixedDistanceTemplateSteps()), null);
}

function assertTemplateWithoutIntervalsHasNoStructure(): void {
  const steps: EnduranceStepLike[] = [
    {
      id: 'steady',
      parentStepId: null,
      isGroup: false,
      repetitions: null,
      orderIndex: 0,
      phaseType: 'warmup',
      durationType: 'time',
      durationS: 600,
      distanceM: null,
      targetType: null,
      targetMin: null,
      targetMax: null,
    },
  ];
  assert.equal(deriveTemplateStructure(steps), null);
}

function assertTotalsBands(): void {
  const template = { distanceM: 10000, durationS: 3000, avgPaceSecPerKm: 300 };
  // Identical totals -> 100.
  assert.equal(scoreTotalsMatch({ distanceM: 10000, durationS: 3000, avgPaceSecPerKm: 300 }, template), 100);
  // 8% distance diff -> distance band 90, pace/duration follow their own diffs.
  const close = scoreTotalsMatch(buildActivityTotals({ distanceM: 10800, durationS: 3000 }), template);
  assert.ok(close >= STRONG_MATCH, `expected strong totals match, got ${close}`);
  // 25% off on everything -> bands 40 -> total 40.
  const far = scoreTotalsMatch({ distanceM: 12500, durationS: 3750, avgPaceSecPerKm: 300 }, template);
  assert.ok(far < POSSIBLE_MATCH, `expected weak totals match, got ${far}`);
  // >30% everywhere -> 0.
  const off = scoreTotalsMatch({ distanceM: 20000, durationS: 6000, avgPaceSecPerKm: 450 }, template);
  assert.equal(off, 0);
}

function assertTotalsMissingVariablesRenormalize(): void {
  const template = { distanceM: 10000, durationS: null, avgPaceSecPerKm: null };
  const score = scoreTotalsMatch({ distanceM: 10000, durationS: 2950, avgPaceSecPerKm: 295 }, template);
  assert.equal(score, 100, 'only distance comparable -> distance-only score');
  assert.equal(scoreTotalsMatch({ distanceM: null, durationS: null, avgPaceSecPerKm: null }, template), 0);
}

function assertAutoMatchNeedsTwoSignalsAndClearMargin(): void {
  assert.equal(
    countComparableTotalSignals(
      { distanceM: 10000, durationS: null, avgPaceSecPerKm: null },
      { distanceM: 10000, durationS: null, avgPaceSecPerKm: null },
    ),
    1,
  );
  assert.equal(isMatchMarginSufficient(90, 82), false);
  assert.equal(isMatchMarginSufficient(90, 81.99), true);
  assert.equal(isMatchMarginSufficient(90, 83), false);
  assert.equal(isMatchMarginSufficient(90, null), true);
}

function assertBuildActivityTotalsDerivesPace(): void {
  const totals = buildActivityTotals({ distanceM: 10000, durationS: 3000 });
  assert.equal(totals.avgPaceSecPerKm, 300);
  assert.equal(buildActivityTotals({ distanceM: null, durationS: 3000 }).avgPaceSecPerKm, null);
}

function assertBuildTemplateTotalsFallsBackToSteps(): void {
  const totals = buildTemplateTotals({ totalDistanceM: null, totalDurationS: null }, templateSteps(6, 400, 225, 90));
  assert.ok(totals.distanceM != null && Math.round(totals.distanceM) === 2400);
  assert.ok(totals.durationS != null && totals.durationS > 0);
}

assertExactIntervalsAreStrongStructuralMatch();
assertExactSuuntoWorkoutMatchesCompleteTemplateSequence();
assertPaceIsLaxWhenCompleteStructureMatches();
assertBoundaryDifferenceAboveFortyPercentRejectsStructure();
assertOneRepetitionDifferenceOnlyProducesSuggestion();
assertMoreThanOneRepetitionDifferenceHasNoTemplateAlignment();
assertMissingFinalRecoveryCannotBecomeShorterWorkoutSuggestion();
assertOneExtraRepIsOnlyPossibleMatch();
assertTwoExtraRepsAreNoStructuralMatch();
assertDifferentWorkoutIsNoStructuralMatch();
assertStructuralSignalsOnlyCountComparableValues();
assertSteadyAutolapsProduceNoStructure();
assertRecoveryMustAppearBetweenEveryWorkPair();
assertContinuousAutolapsCannotMatchRecoveryTemplate();
assertUniformAutolapsCannotImitateTimeRecoveries();
assertUniformDistanceAutolapsCannotImitateRecoveriesThroughPaceChanges();
assertUniformTimeAutolapsCannotImitateDistanceChanges();
assertUniformAutolapsAreRejectedBeforeOpenBoundaryAlignment();
assertUniformAutolapsCannotImitateIntervalsWithoutRecoveries();
assertRecoveryTemplateIsMarkedAsStrictlyStructured();
assertRecoveryDurationMustMatchTemplate();
assertMultipleRecoveryLapsAreSummed();
assertDistanceRecoveriesMatchWithExistingTolerance();
assertExtraActivityIsOnlyAcceptedOutsideTheTemplate();
assertTooFewLapsProduceNoStructure();
assertTemplateDistanceMatchIgnoresWarmupAndCooldown();
assertRequiredBoundaryPhasesCannotBeSkipped();
assertBoundaryPhaseTargetsMustMatch();
assertTemplateDistanceMatchWorksForMultipleDistances();
assertShortIntervalsDoNotUseEightyMeterTolerance();
assertShortIntervalsAllowTwentyPercentDistanceDifference();
assertTemplateDistanceMatchSupportsMixedBlocks();
assertTemplateDistanceMatchRejectsDifferentSequence();
assertTwoGroupsCannotEachHideOneExtraRepetition();
assertTemplateWithoutIntervalsHasNoStructure();
assertTotalsBands();
assertTotalsMissingVariablesRenormalize();
assertAutoMatchNeedsTwoSignalsAndClearMargin();
assertBuildActivityTotalsDerivesPace();
assertBuildTemplateTotalsFallsBackToSteps();
