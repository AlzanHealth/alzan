import assert from 'node:assert/strict';
import {
  buildTrainingPlanAiPrompt,
  serializeTrainingExerciseAiClipboardCsv,
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
    exercise_name_es: 'Sentadilla catálogo privada',
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

const clipboardCsv = serializeTrainingExerciseAiClipboardCsv(catalog);
assert.match(clipboardCsv, /^ejercicios\.csv\nexercises_rows\nexercise_name_es,primary_muscle,equipment\n/);
assert.ok(clipboardCsv.includes('"Press, inclinado",chest,barbell'));
assert.ok(clipboardCsv.includes('Sentadilla catálogo privada,"legs\nquads",'));
assert.ok(
  clipboardCsv.indexOf('Press, inclinado') < clipboardCsv.indexOf('Sentadilla catálogo privada'),
  'the clipboard catalog must retain deterministic localized-name sorting',
);
assert.ok(!clipboardCsv.includes('exercise_id'));
assert.ok(!clipboardCsv.includes('exercise_name_en'));
assert.ok(!clipboardCsv.includes('Incline "press"'));
assert.ok(!clipboardCsv.includes(catalog[0].exercise_id));

const prompt = buildTrainingPlanAiPrompt(catalog, '2026-09-28');
assert.ok(prompt.startsWith(TRAINING_PLAN_IMPORT_PROMPT));
assert.ok(prompt.includes('El catálogo completo de 2 ejercicios ya está copiado'));
assert.ok(prompt.includes('Pégalo aquí con Ctrl+V o Cmd+V'));
assert.ok(prompt.includes('Debajo del catálogo, pega o escribe tu entrenamiento'));
assert.ok(prompt.includes('una fotografía'));
assert.ok(prompt.includes('una única sesión'));
assert.ok(prompt.includes('2026-09-28'));
assert.ok(prompt.includes('Si solo hay una sesión y no indica fecha'));
assert.ok(prompt.includes('Envía el mensaje manualmente'));
assert.ok(prompt.includes('selecciona exactamente exercise_name_es'));
assert.ok(prompt.includes('Omite exercise_id'));
assert.ok(prompt.includes('Alzan resolverá el UUID al importar el JSON'));
assert.ok(prompt.includes('tablas del DOCX'));
assert.ok(prompt.includes('rutinas de gimnasio'));
assert.ok(prompt.includes('comillas ASCII'));
assert.ok(prompt.includes('frontend lo marcará como pendiente'));
assert.ok(prompt.includes('conserva el nombre fuente; el frontend pedirá selección'));
assert.doesNotMatch(prompt, /[“”‘’]/, 'AI prompt must use ASCII quotes');
assert.ok(prompt.includes('exercises_rows'));
assert.ok(!prompt.includes('exercise_id,exercise_name_es,exercise_name_en'));
assert.ok(!prompt.includes('Press, inclinado'));
assert.ok(!prompt.includes('Incline "press"'));
assert.ok(!prompt.includes('Sentadilla catálogo privada'));
// URL encoding, not character count, determines whether clipboard fallback is needed.
assert.ok(prompt.includes('bloques de 7 días'));
assert.ok(!prompt.includes('owner_user_id'));
assert.ok(!prompt.includes('description_es'));

const largeCatalog: TrainingExerciseAiCatalogRow[] = Array.from({ length: 2_012 }, (_, index) => ({
  exercise_id: `exercise-${index}`,
  exercise_name_es: `Ejercicio ${String(index).padStart(4, '0')}`,
  exercise_name_en: null,
  exercise_type: 'reps',
  load_type: 'external',
  primary_muscle: 'full_body',
  secondary_muscle: null,
  equipment: 'barbell',
  is_custom: false,
}));
const largeClipboardCsv = serializeTrainingExerciseAiClipboardCsv(largeCatalog);
assert.ok(largeClipboardCsv.startsWith('ejercicios.csv\nexercises_rows\nexercise_name_es,primary_muscle,equipment\n'));
assert.equal(largeClipboardCsv.split('\n').length, largeCatalog.length + 3);
largeCatalog.forEach(exercise => {
  assert.ok(largeClipboardCsv.includes(exercise.exercise_name_es), `${exercise.exercise_name_es} must be serialized`);
});

console.log('trainingPlanAiPrompt tests passed');
