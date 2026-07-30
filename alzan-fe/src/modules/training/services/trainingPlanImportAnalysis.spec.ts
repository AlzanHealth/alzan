import assert from 'node:assert/strict';

const rawDocument = JSON.stringify({
  format: 'alzan-training-plan',
  version: 1,
  plan_name: 'Plan',
  start_date: '2026-08-03',
  end_date: '2026-08-03',
  weeks: [
    {
      week_number: 1,
      sessions: [
        {
          date: '2026-08-03',
          weekday: 'lunes',
          sport: 'running',
          name: 'Rodaje',
          running_steps: [{ phase_type: 'interval', duration_type: 'time', duration_s: 1200 }],
        },
      ],
    },
  ],
});

const main = async () => {
  const analysisModule = await import('./trainingPlanImportAnalysis').catch(() => null);
  assert.ok(analysisModule, 'Expected the training import analysis module to exist');
  const { analyzeTrainingPlanJson } = analysisModule;

  const accepted = await analyzeTrainingPlanJson(rawDocument, async () => undefined);
  assert.equal(accepted.ok, true);

  const missingExercise = await analyzeTrainingPlanJson(rawDocument, async () => {
    throw new Error('No se ha encontrado el ejercicio "Inventado"');
  });
  assert.equal(missingExercise.ok, false);
  if (!missingExercise.ok) {
    assert.equal(missingExercise.errors[0]?.code, 'invalid_session_shape');
    assert.match(missingExercise.errors[0]?.message ?? '', /Inventado/);
  }

  let invalidPreflightCalls = 0;
  const invalid = await analyzeTrainingPlanJson('{', async () => {
    invalidPreflightCalls += 1;
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalidPreflightCalls, 0);
};

void main();
