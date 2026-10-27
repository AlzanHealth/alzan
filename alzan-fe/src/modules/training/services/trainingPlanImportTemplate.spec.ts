import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import {
  buildTrainingPlanImportTemplate,
  TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT,
  TRAINING_PLAN_IMPORT_PROMPT,
  TRAINING_PLAN_IMPORT_TEMPLATE,
} from './trainingPlanImportTemplate';
import { parseTrainingPlanJson } from './trainingPlanImportContract';

assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('running'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('DOCX'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('aunque tenga otro nombre'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('CSV adjunto'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('No generes el campo notes'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('No generes rpe, rir, rir_min ni rir_max'));
assert.ok(
  TRAINING_PLAN_IMPORT_PROMPT.includes(
    'Si el DOCX contiene un RIR objetivo por serie, conserva solo ese dato como rir_by_set',
  ),
);
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('No inventes RIR; si no aparece, omite rir_by_set'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('No uses target_type: "rpe"'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('No escribas duration_s, distance_m'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('Cada exercise solo puede usar'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('Cada sesión debe incluir modality'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('modality: outdoor'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('modality: gym'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('endurance, speed, tempo_threshold, long_run, recovery o test'));
assert.ok(
  TRAINING_PLAN_IMPORT_PROMPT.includes('hypertrophy, strength, muscular_endurance, technique, mobility o recovery'),
);
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('Copia exactamente fechas'));
assert.ok(
  TRAINING_PLAN_IMPORT_PROMPT.includes(
    'Para ejercicios de fuerza, si la fuente da un rango o dos opciones de repeticiones para un ejercicio, elige el número mayor y escríbelo en reps',
  ),
);
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('informe de bloqueo'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('exercise_id'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('weekday'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('45 días'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('La raíz solo contiene format, version'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('Fases permitidas'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('No inventes UUID'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('alternativa más parecida'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('mismo patrón de movimiento'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('10 min'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('límite inferior'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('progression_key'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('objetivos de ritmo'));
assert.ok(TRAINING_PLAN_IMPORT_PROMPT.includes('Nunca reutilices template_key'));
assert.ok(!TRAINING_PLAN_IMPORT_PROMPT.includes('caso real'));
assert.ok(!TRAINING_PLAN_IMPORT_PROMPT.includes('23/06'));
assert.doesNotMatch(TRAINING_PLAN_IMPORT_PROMPT, /conserva.*notes/i);
assert.ok(TRAINING_PLAN_IMPORT_TEMPLATE.includes('"weekday": "lunes"'));
assert.ok(TRAINING_PLAN_IMPORT_TEMPLATE.includes('"phase_type": "recovery"'));
assert.ok(!TRAINING_PLAN_IMPORT_TEMPLATE.includes('REEMPLAZAR_UUID'));
assert.equal(parseTrainingPlanJson(TRAINING_PLAN_IMPORT_TEMPLATE).ok, true);
assert.ok(TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT.includes(TRAINING_PLAN_IMPORT_TEMPLATE));
assert.doesNotMatch(TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT, /[“”‘’]/, 'copyable prompt must use ASCII quotes');
assert.doesNotMatch(TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT, /CATÁLOGO DE EJERCICIOS DE ALZAN/);
assert.doesNotMatch(TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT, /11111111-1111-4111-8111-111111111111/);
assert.ok(TRAINING_PLAN_IMPORT_TEMPLATE.includes('"workout_goal": "speed"'));
assert.ok(TRAINING_PLAN_IMPORT_TEMPLATE.includes('"modality": "gym"'));

const datedTemplate = buildTrainingPlanImportTemplate(new Date('2026-07-30T12:00:00+02:00'));
assert.ok(datedTemplate.includes('"start_date": "2026-08-03"'));
assert.ok(datedTemplate.includes('"end_date": "2026-08-09"'));

for (const fileName of ['alzan-training-plan-v1.template.json', 'alzan-training-plan-v1.example.json']) {
  const fileContent = readFileSync(new URL(`../../../../../docs/templates/${fileName}`, import.meta.url), 'utf8');
  const parsedFile = parseTrainingPlanJson(fileContent);
  assert.equal(parsedFile.ok, true, `${fileName} must remain importable`);

  if (fileName === 'alzan-training-plan-v1.example.json' && parsedFile.ok) {
    const sessions = parsedFile.value.weeks.flatMap(week => week.sessions);
    assert.equal(parsedFile.value.start_date, '2026-08-31');
    assert.equal(parsedFile.value.end_date, '2026-10-04');
    assert.equal(sessions.length, 40);
    assert.equal(sessions.filter(session => session.sport === 'running').length, 20);
    assert.equal(sessions.filter(session => session.sport === 'strength').length, 20);
    assert.ok(sessions.every(session => session.workout_goal));
    assert.equal(sessions.filter(session => session.date === '2026-09-01').length, 2);
    assert.equal(sessions.filter(session => session.date === '2026-09-03').length, 2);
    assert.ok(sessions.some(session => session.date === '2026-09-25'));
    assert.ok(sessions.some(session => session.date === '2026-09-28'));

    const serialized = JSON.stringify(parsedFile.value).toLowerCase();
    assert.doesNotMatch(serialized, /"(?:notes|rpe|rir|rir_min|rir_max)"/);
    assert.ok(sessions.some(session => session.name === 'PUSH'));
    assert.ok(sessions.some(session => session.name === 'PULL'));
    assert.ok(sessions.some(session => session.name === 'PIERNA RUNNER'));
    assert.ok(sessions.some(session => session.name === 'FULL UPPER + CORE'));
  }
}
