import assert from 'node:assert/strict';
import {
  buildTrainingPlanAiPrompt,
  serializeTrainingExerciseCatalogCsv,
  sortTrainingExerciseAiCatalog,
  type TrainingExerciseAiCatalogRow,
} from './trainingPlanAiPrompt';
import { TRAINING_PLAN_IMPORT_PROMPT } from './trainingPlanImportTemplate';

const catalog: TrainingExerciseAiCatalogRow[] = [
  {
    exercise_id: '2',
    exercise_name_es: 'Press, inclinado',
    exercise_name_en: 'Incline "press"',
    exercise_type: 'reps',
    load_type: 'external',
    primary_muscle: 'chest',
    secondary_muscle: 'triceps',
    equipment: 'barbell',
    is_custom: false,
  },
  {
    exercise_id: '1',
    exercise_name_es: 'Sentadilla',
    exercise_name_en: null,
    exercise_type: null,
    load_type: null,
    primary_muscle: 'legs\nquads',
    secondary_muscle: null,
    equipment: null,
    is_custom: true,
  },
];

assert.deepEqual(
  sortTrainingExerciseAiCatalog(catalog).map(row => row.exercise_id),
  ['2', '1'],
  'the catalog must have a stable localized-name order',
);

const csv = serializeTrainingExerciseCatalogCsv(catalog);
assert.match(csv, /^exercise_id,exercise_name_es,exercise_name_en,/);
assert.match(csv, /"Press, inclinado"/);
assert.match(csv, /"Incline ""press"""/);
assert.match(csv, /"legs\nquads"/);
assert.ok(csv.includes(',true'), 'custom exercises must be represented without owner data');

const prompt = buildTrainingPlanAiPrompt(catalog);
assert.ok(prompt.startsWith(TRAINING_PLAN_IMPORT_PROMPT));
assert.ok(prompt.includes('El catálogo incluido sustituye al CSV adjunto'));
assert.ok(prompt.includes('Pega ahora el texto de tu entrenamiento'));
assert.ok(prompt.includes('exercise_id,exercise_name_es,exercise_name_en'));
assert.ok(prompt.includes('Press, inclinado'));
assert.ok(!prompt.includes('owner_user_id'));
assert.ok(!prompt.includes('description_es'));

console.log('trainingPlanAiPrompt tests passed');
