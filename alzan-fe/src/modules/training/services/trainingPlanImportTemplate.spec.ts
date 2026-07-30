import assert from 'node:assert/strict';
import {
  TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT,
  TRAINING_PLAN_IMPORT_PROMPT,
  TRAINING_PLAN_IMPORT_TEMPLATE,
} from './trainingPlanImportTemplate';

assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('running'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('No inventes ejercicios'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('exercise_id'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('weekday'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('45 días'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('martes running fácil + Torso A'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('domingo tirada larga'));
assert.ok(TRAINING_PLAN_IMPORT_TEMPLATE.includes('"weekday": "lunes"'));
assert.ok(TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT.includes(TRAINING_PLAN_IMPORT_TEMPLATE));
