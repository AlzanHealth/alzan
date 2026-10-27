import assert from 'node:assert/strict';
import { enUS } from 'date-fns/locale';
import { createDailyProgressHtml } from './dailyProgressPdfView';
import type { DailyProgress } from './dailyProgressPdf';

const day: DailyProgress = {
  date: '2026-09-29',
  status: 'over_target',
  steps: 0,
  weights: [{ measured_at: '2026-09-29T07:00:00.000Z', weight_kg: 0 }],
  measurements: [{ measured_at: '2026-09-29T07:00:00.000Z', measurement_type: 'waist', value_cm: 0 }],
  sessions: [
    {
      id: 'session-1',
      start_time: '2026-09-29T10:00:00.000Z',
      name: 'Fuerza',
      sport_type: 'strength',
      notes: null,
      duration_s: 3600,
      distance_m: 10000,
      avg_speed_m_per_s: null,
    },
  ],
  sets: [
    {
      session_id: 'session-1',
      exercise_id: 'exercise-1',
      exercise_name: 'Remo <alto>',
      set_number: 1,
      reps: 8,
      weight_kg: 0,
      distance_m: null,
      duration_s: null,
    },
  ],
  meals: [
    {
      id: 'meal-1',
      date: '2026-09-29',
      meal_type: 'lunch',
      name: 'Comida',
      notes: null,
      kcal: 544,
      protein_g: 35,
      carbs_g: 58,
      fats_g: 20,
      adherence_status: 'done_as_planned',
    },
  ],
  items: [
    {
      meal_log_id: 'meal-1',
      name: 'Arroz',
      quantity_g: 120,
      data_quality: 'automatic',
      origin: 'imported',
    },
  ],
  notes: [],
};

const messages: Record<string, string> = {
  'progressPdf.noData': 'No data',
  'training.time': 'Time',
  'progressPdf.steps': 'steps',
  'progressPdf.reps': 'reps',
  'progressPdf.loadNotRecorded': 'Load not recorded',
  'progressPdf.noExercisesRecorded': 'No exercises recorded',
  'progressPdf.unknownExercise': 'Unknown exercise',
  'progressPdf.automatic': 'automatic',
  'progressPdf.manual': 'manual',
  'progressPdf.normalLegend': 'Normal means the complete logged intake.',
  'progressPdf.overTargetLegend': 'Complete intake; no extra food implied.',
  'progressPdf.vacationLegend': 'Possible unlogged extras.',
  'progressPdf.overTarget': 'Ate worse',
  'progressPdf.vacation': 'Vacation',
  'progressPdf.markerLegend': 'Food marker',
  'progressPdf.weightMeasurements': 'Weight and measurements',
  'progressPdf.activity': 'Activity',
  'progressPdf.training': 'Training',
  'progressPdf.food': 'Food',
  'progressPdf.notes': 'Notes',
  'progressPdf.noTrainingRecorded': 'No training session recorded',
  'progressPdf.noFoodRecorded': 'No food log recorded',
  'progressPdf.noIngredients': 'No ingredients',
  'nutrition.kcal': 'kcal',
  'nutrition.proteins': 'Protein',
  'nutrition.carbs': 'Carbs',
  'nutrition.fats': 'Fat',
  'progressPdf.title': 'Daily progress',
  'progressPdf.daysWithFood': 'days with food',
  'progressPdf.trainingDays': 'training days',
  'progressPdf.markedDays': 'marked days',
  'progressPdf.context': 'Context',
  'progressPdf.noTrendData': 'Not enough trend data',
  'progressPdf.periodClose': 'Period close',
  'progressPdf.weightTrend': 'Weight trend',
  'progressPdf.daysWithoutFood': 'Days without food',
  'progressPdf.none': 'None',
  'health.waist': 'Waist',
};
const translate = (key: string) => messages[key] ?? key;
const html = createDailyProgressHtml([day], translate, enUS);
assert.match(html, /0 kg/);
assert.match(html, /0 pasos|0 steps/);
assert.match(html, /120 g/);
assert.match(html, /544 kcal · Protein 35 g · Carbs 58 g · Fat 20 g/);
assert.match(html, /Remo &lt;alto&gt;/);
assert.doesNotMatch(html, /Remo <alto>/);
assert.match(html, /min\/km/);
assert.match(html, /2026|septiembre|September/);

const emptyDay = createDailyProgressHtml(
  [
    {
      ...day,
      date: '2026-09-30',
      status: 'normal',
      steps: null,
      weights: [],
      measurements: [],
      sessions: [],
      sets: [],
      meals: [],
      items: [],
    },
  ],
  translate,
  enUS,
);
assert.match(emptyDay, /progressPdf\.noData|Sin dato|No data/);
assert.match(emptyDay, /progressPdf\.noTrainingRecorded|Sin entrenamiento registrado|No training session recorded/);

const skippedMealHtml = createDailyProgressHtml(
  [{ ...day, meals: day.meals.map(meal => ({ ...meal, adherence_status: 'skipped' })) }],
  translate,
  enUS,
);
assert.doesNotMatch(skippedMealHtml, /544 kcal/);

const timedDay: DailyProgress = {
  ...day,
  sets: [
    { ...day.sets[0], exercise_name: 'Timed plank', reps: null, duration_s: 40 },
    { ...day.sets[0], exercise_name: 'Repetition row', set_number: 2, reps: 8, duration_s: null, weight_kg: 20 },
    { ...day.sets[0], exercise_name: 'Missing metric', set_number: 3, reps: null, duration_s: null },
  ],
};
const timedHtml = createDailyProgressHtml([timedDay], translate, enUS);
assert.match(timedHtml, /Timed plank — 1: Time 0:40 · Load not recorded/);
assert.match(timedHtml, /Repetition row — 2: 8 reps · 20 kg/);
assert.match(timedHtml, /Missing metric — 3: No data · Load not recorded/);
assert.doesNotMatch(timedHtml, /null reps|undefined reps|0\.666666/);
assert.equal((timedHtml.match(/0:40/g) ?? []).length, 1, 'set duration must appear only once');
