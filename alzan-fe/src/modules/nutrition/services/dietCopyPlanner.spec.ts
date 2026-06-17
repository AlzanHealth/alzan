/**
 * Unit tests for the pure diet-copy planning logic.
 *
 * Run with:  pnpm --prefix alzan-fe run verify:diet-copy
 * (plain tsx + node:assert script, matching the repo's spec convention).
 */
import assert from 'node:assert/strict';
import { addWeeks, startOfWeek } from 'date-fns';
import {
  getAlternatingActivationPlan,
  getCatchUpHorizonISO,
  getCatchUpSource,
  getCatchUpTargets,
  getDateFromISOWeekString,
  getISOWeekString,
  getSequentialActivationPlan,
  getVisibleWeekRange,
} from './dietCopyPlanner';

let passed = 0;
let failed = 0;

const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
};

// Fixed reference: Wednesday 2026-06-17 (noon to avoid DST/midnight edges).
const REF = new Date(2026, 5, 17, 12, 0, 0);
const ms = (d: Date) => d.getTime();

// ---------------------------------------------------------------------------
// Visible week range
// ---------------------------------------------------------------------------
test('getVisibleWeekRange returns 7 weeks with W0 at index 2', () => {
  const { weeks, currentWeekIndex } = getVisibleWeekRange(REF);
  assert.equal(weeks.length, 7);
  assert.equal(currentWeekIndex, 2);

  const monday = startOfWeek(REF, { weekStartsOn: 1 });
  for (let i = 0; i < 7; i++) {
    assert.equal(weeks[i].getDay(), 1, 'each visible week starts on a Monday');
    assert.equal(ms(weeks[i]), ms(addWeeks(monday, i - 2)), `week ${i} offset is correct`);
  }
});

// ---------------------------------------------------------------------------
// Sequential ("Copia semanal")
// ---------------------------------------------------------------------------
test('sequential plan copies W0 into the 4 following weeks', () => {
  const { weeks, currentWeekIndex } = getVisibleWeekRange(REF);
  const ops = getSequentialActivationPlan(REF);

  assert.equal(ops.length, 4);
  ops.forEach((op, idx) => {
    assert.equal(ms(op.source), ms(weeks[currentWeekIndex]), 'source is always W0');
    assert.equal(ms(op.target), ms(weeks[currentWeekIndex + 1 + idx]), `target is W+${idx + 1}`);
  });
});

// ---------------------------------------------------------------------------
// Alternating ("Copia alterna")
// ---------------------------------------------------------------------------
test('alternating plan produces A,B,A,B on W+1..W+4 (A=prev week, B=current)', () => {
  const { weeks, currentWeekIndex } = getVisibleWeekRange(REF);
  const planA = weeks[currentWeekIndex - 1]; // previous week
  const planB = weeks[currentWeekIndex]; // current week
  const ops = getAlternatingActivationPlan(REF);

  assert.equal(ops.length, 4);
  ops.forEach((op, idx) => {
    assert.equal(ms(op.target), ms(weeks[currentWeekIndex + 1 + idx]), `target is W+${idx + 1}`);
  });
  assert.equal(ms(ops[0].source), ms(planA), 'W+1 = Plan A');
  assert.equal(ms(ops[1].source), ms(planB), 'W+2 = Plan B');
  assert.equal(ms(ops[2].source), ms(planA), 'W+3 = Plan A');
  assert.equal(ms(ops[3].source), ms(planB), 'W+4 = Plan B');
});

test('sequential and alternating share the same 4 target weeks', () => {
  const seq = getSequentialActivationPlan(REF).map(op => ms(op.target));
  const alt = getAlternatingActivationPlan(REF).map(op => ms(op.target));
  assert.deepEqual(seq, alt);
});

// ---------------------------------------------------------------------------
// ISO week string <-> date round trip (incl. year boundaries)
// ---------------------------------------------------------------------------
test('ISO week string round-trips to the Monday of that week', () => {
  const samples = [
    new Date(2026, 5, 17, 12), // mid-year
    new Date(2026, 0, 1, 12), // Jan 1
    new Date(2026, 11, 31, 12), // Dec 31 -> belongs to ISO 2027-W01
    new Date(2021, 0, 1, 12), // belongs to ISO 2020-W53
    new Date(2024, 11, 30, 12), // belongs to ISO 2025-W01
  ];
  for (const d of samples) {
    const iso = getISOWeekString(d);
    const back = getDateFromISOWeekString(iso);
    assert.equal(back.getDay(), 1, `round-trip yields Monday for ${iso}`);
    assert.equal(getISOWeekString(back), iso, `ISO string is stable for ${iso}`);
    assert.equal(ms(back), ms(startOfWeek(d, { weekStartsOn: 1 })), `Monday matches for ${iso}`);
  }
});

// ---------------------------------------------------------------------------
// Catch-up (runs on app entry)
// ---------------------------------------------------------------------------
test('catch-up returns nothing when the pointer is already at the horizon', () => {
  const horizon = getCatchUpHorizonISO(REF);
  assert.deepEqual(getCatchUpTargets(REF, horizon), []);
});

test('catch-up with no pointer only evaluates the furthest week (W+4)', () => {
  const { weeks } = getVisibleWeekRange(REF);
  const targets = getCatchUpTargets(REF, undefined);
  assert.equal(targets.length, 1);
  assert.equal(ms(targets[0]), ms(weeks[weeks.length - 1]));
});

test('catch-up fills the gap from the last seen week up to the horizon', () => {
  const { weeks, currentWeekIndex } = getVisibleWeekRange(REF);
  const lastSeen = getISOWeekString(weeks[currentWeekIndex + 1]); // saw W+1
  const targets = getCatchUpTargets(REF, lastSeen);

  assert.equal(targets.length, 3, 'expects W+2, W+3, W+4');
  assert.equal(ms(targets[0]), ms(weeks[currentWeekIndex + 2]));
  assert.equal(ms(targets[2]), ms(weeks[currentWeekIndex + 4]));
});

test('catch-up reaches the horizon for a small gap', () => {
  const { weeks } = getVisibleWeekRange(REF);
  const horizon = weeks[weeks.length - 1];
  const lastSeen = getISOWeekString(addWeeks(horizon, -5));
  const targets = getCatchUpTargets(REF, lastSeen);

  assert.equal(targets.length, 5);
  assert.equal(ms(targets[targets.length - 1]), ms(horizon), 'last target is the horizon');
});

test('catch-up is capped at 12 iterations and never exceeds the horizon', () => {
  const { weeks } = getVisibleWeekRange(REF);
  const horizon = weeks[weeks.length - 1];
  const veryOld = getISOWeekString(addWeeks(horizon, -30));
  const targets = getCatchUpTargets(REF, veryOld);

  assert.equal(targets.length, 12, 'hard cap at 12');
  for (const target of targets) {
    assert.ok(target.getTime() <= horizon.getTime() + 1000, 'stays within the horizon');
  }
});

test('catch-up source: sequential = previous week, alternating = two weeks back', () => {
  const target = getVisibleWeekRange(REF).weeks[6];
  assert.equal(ms(getCatchUpSource('sequential', target)), ms(addWeeks(target, -1)));
  assert.equal(ms(getCatchUpSource('alternating', target)), ms(addWeeks(target, -2)));
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} diet-copy planner test(s) failed`);
}
