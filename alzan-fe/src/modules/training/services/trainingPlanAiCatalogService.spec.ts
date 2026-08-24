import assert from 'node:assert/strict';
import { fetchAllTrainingExerciseAiCatalog, type TrainingExerciseAiCatalogPage } from './trainingPlanAiCatalog';

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

  console.log('trainingPlanAiCatalogService tests passed');
};

void main();
