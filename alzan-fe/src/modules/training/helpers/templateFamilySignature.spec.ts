import assert from 'node:assert/strict';
import {
  buildEnduranceTemplateFamilySignature,
  buildGymTemplateFamilySignature,
  classifyTemplateFamilyMatch,
  normalizeTemplateKey,
  type EnduranceSignatureInput,
  type GymSignatureInput,
} from './templateFamilySignature';

const runningBase: EnduranceSignatureInput = {
  sportType: 'running',
  workoutGoal: 'speed',
  modality: 'track',
  steps: [
    { phaseType: 'warmup', durationType: 'time', isGroup: false, repetitions: 1 },
    { phaseType: 'interval', durationType: 'distance', isGroup: true, repetitions: 6 },
    { phaseType: 'recovery', durationType: 'time', isGroup: false, repetitions: 1 },
    { phaseType: 'cooldown', durationType: 'time', isGroup: false, repetitions: 1 },
  ],
};

const strengthBase: GymSignatureInput = {
  workoutGoal: 'strength',
  modality: 'free_weights',
  exercises: [
    { exerciseId: 'squat', orderIndex: 0, isWarmup: false, supersetNextExerciseId: null },
    { exerciseId: 'bench', orderIndex: 1, isWarmup: false, supersetNextExerciseId: null },
  ],
};

const runningSignature = buildEnduranceTemplateFamilySignature(runningBase);
const runningVariantSignature = buildEnduranceTemplateFamilySignature({
  ...runningBase,
  steps: runningBase.steps.map(step => ({ ...step, repetitions: step.repetitions === 6 ? 8 : step.repetitions })),
});
assert.equal(runningSignature, runningVariantSignature);

assert.notEqual(
  runningSignature,
  buildEnduranceTemplateFamilySignature({
    ...runningBase,
    steps: runningBase.steps.map(step =>
      step.phaseType === 'recovery' ? { ...step, durationType: 'distance' } : step,
    ),
  }),
);

assert.equal(normalizeTemplateKey('  Running Intervals 400m '), 'running_intervals_400m');
assert.equal(buildGymTemplateFamilySignature(strengthBase), buildGymTemplateFamilySignature(strengthBase));
assert.notEqual(
  buildGymTemplateFamilySignature(strengthBase),
  buildGymTemplateFamilySignature({
    ...strengthBase,
    exercises: strengthBase.exercises.map((exercise, index) => ({ ...exercise, orderIndex: index === 0 ? 1 : 0 })),
  }),
);

assert.equal(
  classifyTemplateFamilyMatch({ explicitKey: 'intervals-400', candidateKey: 'intervals-400' }).kind,
  'exact',
);
assert.equal(classifyTemplateFamilyMatch({ signature: 'same', candidateSignature: 'same' }).kind, 'exact');
assert.equal(classifyTemplateFamilyMatch({ signature: 'one', candidateSignature: 'two' }).kind, 'none');
