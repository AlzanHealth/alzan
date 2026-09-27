import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const health = read('../modules/health/screens/HealthHome.tsx');
assert.doesNotMatch(health, /t\('health\.(currentWeight|lastNight)'\)/);
const training = read('../screens/training/TrainingHomeScreen.tsx');
assert.ok(training.indexOf('<ActiveSessionBanner session=') < training.indexOf('{renderDailyPlan()}'));
assert.match(read('../screens/nutrition/NutritionHomeScreen.tsx'), /navigate\('ShoppingList'/);
assert.doesNotMatch(read('../context/ThemeContext.tsx'), /textSecondary: '#8E8E93'/);
const daySwitcher = read('../components/common/DaySwitcher.tsx');
assert.match(daySwitcher, /CalendarDatePickerModal/);
assert.doesNotMatch(daySwitcher, /\[selectedDate, visibleWeekIndex\]/);
console.log('Interface audit regression checks passed');
