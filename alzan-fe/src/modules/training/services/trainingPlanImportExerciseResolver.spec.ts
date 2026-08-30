import assert from 'node:assert/strict';

const main = async () => {
  const resolverModule = await import('./trainingPlanImportExerciseResolver').catch(() => null);
  assert.ok(resolverModule, 'Expected the training exercise resolver module to exist');

  const resolveTrainingPlanExercisesFromCatalog = (resolverModule as Record<string, unknown>)
    .resolveTrainingPlanExercisesFromCatalog;
  const resolveTrainingPlanExerciseResolutions = (resolverModule as Record<string, unknown>)
    .resolveTrainingPlanExerciseResolutions;
  const selectTrainingPlanExerciseCandidate = (resolverModule as Record<string, unknown>)
    .selectTrainingPlanExerciseCandidate;
  const areTrainingPlanExerciseResolutionsReady = (resolverModule as Record<string, unknown>)
    .areTrainingPlanExerciseResolutionsReady;

  assert.equal(typeof resolveTrainingPlanExercisesFromCatalog, 'function');
  assert.equal(typeof resolveTrainingPlanExerciseResolutions, 'function');
  assert.equal(typeof selectTrainingPlanExerciseCandidate, 'function');
  assert.equal(typeof areTrainingPlanExerciseResolutionsReady, 'function');

  if (typeof resolveTrainingPlanExercisesFromCatalog === 'function') {
    const squatId = '11111111-1111-4111-8111-111111111111';
    const deadliftId = '22222222-2222-4222-8222-222222222222';
    const catalog = [
      {
        id: squatId,
        base_name_es: 'Sentadilla',
        base_name_en: 'Squat',
        primary_muscle: 'Cuádriceps',
        equipment: 'Barra',
      },
      {
        id: deadliftId,
        base_name_es: 'Peso muerto',
        base_name_en: 'Deadlift',
        primary_muscle: 'Isquiosurales',
        equipment: 'Barra',
      },
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

    if (
      typeof resolveTrainingPlanExerciseResolutions === 'function' &&
      typeof selectTrainingPlanExerciseCandidate === 'function' &&
      typeof areTrainingPlanExerciseResolutionsReady === 'function'
    ) {
      const ambiguousA = { id: 'a', base_name_es: 'Remo sentado cable', base_name_en: null, equipment: 'Cable' };
      const ambiguousB = { id: 'b', base_name_es: 'Remo sentado máquina', base_name_en: null, equipment: 'Máquina' };
      const resolutions = resolveTrainingPlanExerciseResolutions(
        [
          { exercise_name: 'Remo sentado', order_index: 0, sets: 3, reps: 10 },
          { exercise_name: 'Press banca barra', order_index: 1, sets: 3, reps: 6 },
          { exercise_name: 'Sentadilla trasera', order_index: 2, sets: 3, reps: 5 },
        ],
        [
          ...catalog,
          ambiguousA,
          ambiguousB,
          { id: 'c', base_name_es: 'Sentadilla trasera con barra', base_name_en: null, equipment: 'Barra' },
        ],
      ) as Array<Record<string, unknown>>;
      assert.equal(resolutions.length, 3);
      assert.equal(resolutions[0]?.selectedCandidate, null);
      assert.equal((resolutions[0]?.candidates as Array<Record<string, unknown>>)?.length, 2);
      assert.equal(resolutions[1]?.selectedCandidate, null);
      assert.equal((resolutions[2]?.selectedCandidate as Record<string, unknown>)?.id, 'c');
      assert.equal(areTrainingPlanExerciseResolutionsReady(resolutions), false);

      const idOnlyResolutions = resolveTrainingPlanExerciseResolutions(
        [{ exercise_id: squatId, order_index: 0, sets: 3, reps: 5 }],
        catalog,
      ) as Array<Record<string, unknown>>;
      assert.equal((idOnlyResolutions[0]?.selectedCandidate as Record<string, unknown>)?.id, squatId);
      assert.equal((idOnlyResolutions[0]?.candidates as Array<Record<string, unknown>>)?.[0]?.id, squatId);
      assert.equal(areTrainingPlanExerciseResolutionsReady(idOnlyResolutions), true);

      const selected = selectTrainingPlanExerciseCandidate(resolutions, resolutions[0]?.resolutionKey, 'a') as Array<
        Record<string, unknown>
      >;
      assert.equal((selected[0]?.selectedCandidate as Record<string, unknown>)?.id, 'a');
      assert.equal(areTrainingPlanExerciseResolutionsReady(selected), false);

      const unchangedForUnknownCandidate = selectTrainingPlanExerciseCandidate(
        resolutions,
        resolutions[0]?.resolutionKey,
        'not-in-candidates',
      ) as Array<Record<string, unknown>>;
      assert.equal(unchangedForUnknownCandidate[0]?.selectedCandidate, null);
    }
  }
};

void main();
