import assert from 'node:assert/strict';
import {
  getMaxNextMealCutoffHours,
  getMealTypeForTime,
  normalizeNextMealCutoffHours,
  type MealSchedule,
} from './nextMealPlanner';

const schedule: MealSchedule = {
  breakfast: { time: '08:00' },
  almuerzo: { time: '11:00' },
  lunch: { time: '14:00' },
  merienda: { time: '17:30' },
  dinner: { time: '21:00' },
};

const enabledMeals = {
  breakfast: true,
  almuerzo: true,
  lunch: true,
  merienda: true,
  dinner: true,
};

const at = (hours: number, minutes = 0) => new Date(2026, 7, 7, hours, minutes, 0, 0);

const testUsesOneHourCutoffs = () => {
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(10, 0)), 'breakfast');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(10, 1)), 'almuerzo');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(13, 0)), 'almuerzo');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(13, 1)), 'lunch');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(16, 30)), 'lunch');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(16, 31)), 'merienda');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(20, 0)), 'merienda');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(20, 1)), 'dinner');
};

const testKeepsDinnerThroughTheNight = () => {
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(21)), 'dinner');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(3)), 'dinner');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(5)), 'dinner');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(5, 30)), 'dinner');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(5, 31)), 'breakfast');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(7, 59)), 'breakfast');
};

const testUsesTheUsersConfiguredTimes = () => {
  const customSchedule: MealSchedule = {
    breakfast: { time: '07:00' },
    almuerzo: { time: '10:00' },
    lunch: { time: '13:00' },
    merienda: { time: '16:00' },
    dinner: { time: '20:00' },
  };

  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(9)), 'breakfast');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(9, 1)), 'almuerzo');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(12)), 'almuerzo');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(12, 1)), 'lunch');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(15)), 'lunch');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(15, 1)), 'merienda');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(19)), 'merienda');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(19, 1)), 'dinner');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(4)), 'dinner');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(5)), 'breakfast');
};

const testUsesTheConfiguredCutoffAndNightMultiplier = () => {
  const customSchedule: MealSchedule = {
    breakfast: { time: '07:00' },
    almuerzo: { time: '10:00' },
    lunch: { time: '13:00' },
    merienda: { time: '16:00' },
    dinner: { time: '20:00' },
  };

  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(8), { cutoffHours: 2 }), 'breakfast');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(8, 1), { cutoffHours: 2 }), 'almuerzo');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(11), { cutoffHours: 2 }), 'almuerzo');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(11, 1), { cutoffHours: 2 }), 'lunch');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(18), { cutoffHours: 2 }), 'merienda');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(18, 1), { cutoffHours: 2 }), 'dinner');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(2), { cutoffHours: 2 }), 'dinner');
  assert.equal(getMealTypeForTime(customSchedule, enabledMeals, at(2, 1), { cutoffHours: 2 }), 'breakfast');
};

const testCapsNightCutoffAndNeverExceedsTheMealInterval = () => {
  const longNightSchedule: MealSchedule = {
    breakfast: { time: '08:00' },
    almuerzo: { time: '12:00' },
    lunch: { time: '16:00' },
    merienda: { time: '20:00' },
    dinner: { time: '22:00' },
  };

  assert.equal(getMealTypeForTime(longNightSchedule, enabledMeals, at(2), { cutoffHours: 3 }), 'dinner');
  assert.equal(getMealTypeForTime(longNightSchedule, enabledMeals, at(2, 1), { cutoffHours: 3 }), 'breakfast');

  const shortNightSchedule: MealSchedule = {
    ...schedule,
    breakfast: { time: '22:00' },
  };

  assert.equal(getMealTypeForTime(shortNightSchedule, enabledMeals, at(20)), 'merienda');
  assert.equal(getMealTypeForTime(shortNightSchedule, enabledMeals, at(21)), 'dinner');
  assert.equal(getMealTypeForTime(shortNightSchedule, enabledMeals, at(21, 1)), 'breakfast');
};

const testSupportsZeroAndTwoDecimalCutoffs = () => {
  assert.equal(normalizeNextMealCutoffHours(0), 0);
  assert.equal(normalizeNextMealCutoffHours(1.239), 1.24);
  assert.equal(normalizeNextMealCutoffHours(1.2), 1.2);

  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(10, 59), { cutoffHours: 0 }), 'breakfast');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(11), { cutoffHours: 0 }), 'almuerzo');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(13, 59), { cutoffHours: 0 }), 'almuerzo');
  assert.equal(getMealTypeForTime(schedule, enabledMeals, at(14), { cutoffHours: 0 }), 'lunch');
};

const testLimitsTheSettingToTheShortestEnabledMealInterval = () => {
  assert.equal(getMaxNextMealCutoffHours(schedule, enabledMeals), 3);
  assert.equal(getMaxNextMealCutoffHours(schedule, { ...enabledMeals, almuerzo: false }), 3.5);
  assert.equal(normalizeNextMealCutoffHours(4, 3.5), 3.5);
  assert.equal(normalizeNextMealCutoffHours(undefined, 0.5), 0.5);
};

const testSkipsDisabledMeals = () => {
  assert.equal(getMealTypeForTime(schedule, { ...enabledMeals, almuerzo: false }, at(12)), 'breakfast');
  assert.equal(getMealTypeForTime(schedule, { ...enabledMeals, almuerzo: false }, at(13, 1)), 'lunch');
};

const testFallsBackToBreakfastWhenNoMealIsEnabled = () => {
  assert.equal(
    getMealTypeForTime(
      schedule,
      {
        breakfast: false,
        almuerzo: false,
        lunch: false,
        merienda: false,
        dinner: false,
      },
      at(12),
    ),
    'breakfast',
  );
};

testUsesOneHourCutoffs();
testKeepsDinnerThroughTheNight();
testUsesTheUsersConfiguredTimes();
testUsesTheConfiguredCutoffAndNightMultiplier();
testCapsNightCutoffAndNeverExceedsTheMealInterval();
testSupportsZeroAndTwoDecimalCutoffs();
testLimitsTheSettingToTheShortestEnabledMealInterval();
testSkipsDisabledMeals();
testFallsBackToBreakfastWhenNoMealIsEnabled();
console.log('nextMealPlanner: all tests passed');
