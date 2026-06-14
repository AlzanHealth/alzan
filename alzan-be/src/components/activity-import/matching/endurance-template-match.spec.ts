import { strict as assert } from 'assert';
import {
  ActivityLapLike,
  buildActivityTotals,
  buildTemplateTotals,
  deriveActivityStructure,
  deriveTemplateStructure,
  EnduranceStepLike,
  POSSIBLE_MATCH,
  scoreStructuralMatch,
  scoreTotalsMatch,
  STRONG_MATCH,
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
assertSteadyAutolapsProduceNoStructure();
assertTooFewLapsProduceNoStructure();
assertTemplateWithoutIntervalsHasNoStructure();
assertTotalsBands();
assertTotalsMissingVariablesRenormalize();
assertBuildActivityTotalsDerivesPace();
assertBuildTemplateTotalsFallsBackToSteps();
