import assert from 'node:assert/strict';

const main = async () => {
  const resolverModule = await import('./trainingPlanImportExerciseResolver').catch(() => null);
  assert.ok(resolverModule, 'Expected the training exercise resolver module to exist');

  const resolveTrainingPlanExercisesFromCatalog = (resolverModule as Record<string, unknown>)
    .resolveTrainingPlanExercisesFromCatalog;

  assert.equal(typeof resolveTrainingPlanExercisesFromCatalog, 'function');

  if (typeof resolveTrainingPlanExercisesFromCatalog === 'function') {
    const squatId = '11111111-1111-4111-8111-111111111111';
    const deadliftId = '22222222-2222-4222-8222-222222222222';
    const catalog = [
      { id: squatId, base_name_es: 'Sentadilla', base_name_en: 'Squat' },
      { id: deadliftId, base_name_es: 'Peso muerto', base_name_en: 'Deadlift' },
    ];

    const byName = resolveTrainingPlanExercisesFromCatalog(
      [{ exercise_name: '  SENTADÍLLA ', order_index: 0, sets: 3 }],
      catalog,
    ) as Map<string, string>;
    assert.equal(byName.get('0:sentadilla'), squatId);

    const unknownIdWithExactName = resolveTrainingPlanExercisesFromCatalog(
      [
        {
          exercise_id: '33333333-3333-4333-8333-333333333333',
          exercise_name: 'Sentadilla',
          order_index: 0,
          sets: 3,
        },
      ],
      catalog,
    ) as Map<string, string>;
    assert.equal(unknownIdWithExactName.get('0:sentadilla'), squatId);

    assert.throws(
      () =>
        resolveTrainingPlanExercisesFromCatalog(
          [{ exercise_id: squatId, exercise_name: 'Peso muerto', order_index: 0, sets: 3 }],
          catalog,
        ),
      /no coincide/i,
    );

    assert.throws(
      () =>
        resolveTrainingPlanExercisesFromCatalog(
          [{ exercise_name: 'Ejercicio inventado', order_index: 0, sets: 3 }],
          catalog,
        ),
      /No se ha encontrado/,
    );
  }
};

void main();
