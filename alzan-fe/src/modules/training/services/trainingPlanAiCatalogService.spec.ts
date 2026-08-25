import assert from 'node:assert/strict';
import {
  createTrainingExerciseAiCatalogLoader,
  fetchAllTrainingExerciseAiCatalog,
  loadTrainingExerciseAiCatalogWithTimeout,
  type TrainingExerciseAiCatalogPage,
  TrainingExerciseAiCatalogTimeoutError,
} from './trainingPlanAiCatalog';
import type { TrainingExerciseAiCatalogRow } from './trainingPlanAiPrompt';

const pages: TrainingExerciseAiCatalogPage[][] = [
  [
    {
      id: '1',
      base_name_es: 'Sentadilla',
      base_name_en: null,
      exercise_type: { code: 'reps' },
      load_type: 'external',
      primary_muscle: { code: 'legs' },
      secondary_muscle: null,
      equipment: { code: 'barbell' },
      is_custom: false,
    },
  ],
  [
    {
      id: '2',
      base_name_es: 'Plancha',
      base_name_en: 'Plank',
      exercise_type: null,
      load_type: null,
      primary_muscle: null,
      secondary_muscle: null,
      equipment: null,
      is_custom: true,
    },
  ],
];

const main = async (): Promise<void> => {
  const ranges: Array<[number, number]> = [];
  const result = await fetchAllTrainingExerciseAiCatalog(async (from, to) => {
    ranges.push([from, to]);
    const page = pages[Math.floor(from / 1)];
    return { data: page ?? [], error: null };
  }, 1);

  assert.deepEqual(ranges, [
    [0, 0],
    [1, 1],
    [2, 2],
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].exercise_id, '1');
  assert.equal(result[1].exercise_id, '2');
  assert.equal(result[1].exercise_name_en, 'Plank');

  await assert.rejects(
    () =>
      fetchAllTrainingExerciseAiCatalog(async () => ({
        data: [],
        error: new Error('catalog unavailable'),
      })),
    /catalog unavailable/,
  );

  const timeoutRequest: { signal?: AbortSignal } = {};
  await assert.rejects(
    () =>
      loadTrainingExerciseAiCatalogWithTimeout(signal => {
        timeoutRequest.signal = signal;
        return new Promise<TrainingExerciseAiCatalogRow[]>(() => undefined);
      }, 5),
    TrainingExerciseAiCatalogTimeoutError,
  );
  assert.equal(timeoutRequest.signal?.aborted, true, 'a timed-out catalog request must be aborted');

  await assert.rejects(
    () => loadTrainingExerciseAiCatalogWithTimeout(async () => [], 50),
    /empty/i,
    'an empty catalog must never be cached as ready',
  );

  let attempts = 0;
  const successfulCatalog: TrainingExerciseAiCatalogRow[] = [
    {
      exercise_id: 'retry-1',
      exercise_name_es: 'Sentadilla',
      exercise_name_en: 'Squat',
      exercise_type: 'reps',
      load_type: 'external',
      primary_muscle: 'quadriceps',
      secondary_muscle: 'gluteus',
      equipment: 'barbell',
      is_custom: false,
    },
  ];
  const loader = createTrainingExerciseAiCatalogLoader(async () => {
    attempts += 1;
    if (attempts === 1) {
      return loadTrainingExerciseAiCatalogWithTimeout(
        () => new Promise<TrainingExerciseAiCatalogRow[]>(() => undefined),
        5,
      );
    }
    return successfulCatalog;
  });

  await assert.rejects(() => loader.preload(), TrainingExerciseAiCatalogTimeoutError);
  assert.deepEqual(await loader.preload(), successfulCatalog, 'retry must start a fresh request after a timeout');
  assert.deepEqual(await loader.preload(), successfulCatalog, 'a successful catalog must be reused');
  assert.equal(attempts, 2, 'cached catalog data must prevent an unnecessary third request');

  console.log('trainingPlanAiCatalogService tests passed');
};

void main();
