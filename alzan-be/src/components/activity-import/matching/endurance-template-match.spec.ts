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
} from './endurance-template-match';

function lap(distanceM: number, durationSeconds: number): ActivityLapLike {
  return { distanceM, durationSeconds, avgPaceSecondsPerKm: (durationSeconds / distanceM) * 1000 };
}

function intervalLaps(reps: number, repDistanceM: number, repDurationS: number, recoveryS: number): ActivityLapLike[] {
  const laps: ActivityLapLike[] = [];
  for (let index = 0; index < reps; index += 1) {
    laps.push(lap(repDistanceM, repDurationS));
    if (index < reps - 1) laps.push(lap(200, recoveryS));
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

function assertOneExtraRepIsStillStrongMatch(): void {
  // 7 reps vs planned 6 -> reps diff 16.7% lands in the 10-20% band (70).
  const activityStructure = deriveActivityStructure(intervalLaps(7, 400, 90, 90));
  assert.ok(activityStructure);
  assert.equal(activityStructure.repCount, 7);
  const template = deriveTemplateStructure(templateSteps(6, 400, 225, 90));
  assert.ok(template);
  const score = scoreStructuralMatch(activityStructure, template);
  assert.ok(score >= STRONG_MATCH, `7 vs 6 reps should remain strong (reps band 70), got ${score}`);
}

function assertTwoExtraRepsArePossibleMatch(): void {
  // 8 reps vs planned 6 -> reps diff 33% -> reps subscore 0 -> possible match.
  const activityStructure = deriveActivityStructure(intervalLaps(8, 400, 90, 90));
  assert.ok(activityStructure);
  const template = deriveTemplateStructure(templateSteps(6, 400, 225, 90));
  assert.ok(template);
  const score = scoreStructuralMatch(activityStructure, template);
  assert.ok(score >= POSSIBLE_MATCH && score < STRONG_MATCH, `expected possible match (60-79), got ${score}`);
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
  const distances = [100, 200, 400, 800, 1000];
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
    lap(160, 120),
    lap(790, 198),
    lap(170, 120),
    lap(815, 203),
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
  assert.equal(isMatchMarginSufficient(90, 82), true);
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
assertOneExtraRepIsStillStrongMatch();
assertTwoExtraRepsArePossibleMatch();
assertDifferentWorkoutIsNoStructuralMatch();
assertStructuralSignalsOnlyCountComparableValues();
assertSteadyAutolapsProduceNoStructure();
assertTooFewLapsProduceNoStructure();
assertTemplateDistanceMatchIgnoresWarmupAndCooldown();
assertRequiredBoundaryPhasesCannotBeSkipped();
assertBoundaryPhaseTargetsMustMatch();
assertTemplateDistanceMatchWorksForMultipleDistances();
assertShortIntervalsDoNotUseEightyMeterTolerance();
assertShortIntervalsAllowTwentyPercentDistanceDifference();
assertTemplateDistanceMatchSupportsMixedBlocks();
assertTemplateDistanceMatchRejectsDifferentSequence();
assertTemplateWithoutIntervalsHasNoStructure();
assertTotalsBands();
assertTotalsMissingVariablesRenormalize();
assertAutoMatchNeedsTwoSignalsAndClearMargin();
assertBuildActivityTotalsDerivesPace();
assertBuildTemplateTotalsFallsBackToSteps();
