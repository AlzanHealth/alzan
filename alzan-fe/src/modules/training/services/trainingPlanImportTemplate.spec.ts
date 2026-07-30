import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import {
  buildTrainingPlanImportClipboardText,
  buildTrainingPlanImportTemplate,
  TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT,
  TRAINING_PLAN_IMPORT_PROMPT,
  TRAINING_PLAN_IMPORT_TEMPLATE,
} from './trainingPlanImportTemplate';
import { parseTrainingPlanJson } from './trainingPlanImportContract';

assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('running'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('No inventes ejercicios'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('exercise_id'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('weekday'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('45 días'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('Se permiten varias sesiones distintas en una misma fecha'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('respeta exactamente la distribución semanal'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('No pongas repetitions en un intervalo plano'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('mismo bloque de 7 días'));
assert.ok(!TRAINING_PLAN_IMPORT_PROMPT.includes('caso real'));
assert.ok(!TRAINING_PLAN_IMPORT_PROMPT.includes('23/06'));
assert.ok(TRAINING_PLAN_IMPORT_TEMPLATE.includes('"weekday": "lunes"'));
assert.ok(TRAINING_PLAN_IMPORT_TEMPLATE.includes('"phase_type": "recovery"'));
assert.ok(!TRAINING_PLAN_IMPORT_TEMPLATE.includes('REEMPLAZAR_UUID'));
assert.equal(parseTrainingPlanJson(TRAINING_PLAN_IMPORT_TEMPLATE).ok, true);
assert.ok(TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT.includes(TRAINING_PLAN_IMPORT_TEMPLATE));
const clipboardWithCatalog = buildTrainingPlanImportClipboardText([
  {
    id: '11111111-1111-4111-8111-111111111111',
    base_name_es: 'Sentadilla',
    base_name_en: 'Squat',
  },
]);
assert.ok(clipboardWithCatalog.includes('CATÁLOGO DE EJERCICIOS DE ALZAN'));
assert.ok(clipboardWithCatalog.includes('11111111-1111-4111-8111-111111111111 | Sentadilla | Squat'));

const datedTemplate = buildTrainingPlanImportTemplate(new Date('2026-07-30T12:00:00+02:00'));
assert.ok(datedTemplate.includes('"start_date": "2026-08-03"'));
assert.ok(datedTemplate.includes('"end_date": "2026-08-30"'));

for (const fileName of ['alzan-training-plan-v1.template.json', 'alzan-training-plan-v1.example.json']) {
  const fileContent = readFileSync(new URL(`../../../../../docs/templates/${fileName}`, import.meta.url), 'utf8');
  assert.equal(parseTrainingPlanJson(fileContent).ok, true, `${fileName} must remain importable`);
}
