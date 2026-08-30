import assert from 'node:assert/strict';
import {
  getVisibleTrainingExerciseResolutions,
  isTrainingExerciseResolutionPending,
} from './trainingPlanImportConflictFilter';
import type { TrainingExerciseResolution } from './trainingPlanImportExerciseResolver';

const candidate = { id: 'id', base_name_es: 'Sentadilla', base_name_en: null };
const resolutions: TrainingExerciseResolution[] = [
  { resolutionKey: '0:sentadilla', sourceName: 'Sentadilla', candidates: [candidate], selectedCandidate: candidate },
  { resolutionKey: '1:press', sourceName: 'Press', candidates: [], selectedCandidate: null },
];

assert.equal(isTrainingExerciseResolutionPending(resolutions[0]!), false);
assert.deepEqual(
  getVisibleTrainingExerciseResolutions(resolutions, true).map(item => item.resolutionKey),
  ['1:press'],
);
assert.equal(getVisibleTrainingExerciseResolutions(resolutions, false).length, 2);
