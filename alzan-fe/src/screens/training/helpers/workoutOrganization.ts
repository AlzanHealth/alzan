import type { ActiveWorkoutDraft } from './activeWorkoutDraft';
import type { WorkoutTemplateExerciseWithDetails } from '../ActiveWorkoutScreen';
import type { ExerciseWithDetails } from '../../../types/training';
import {
  getDefaultGymExerciseTargets,
  isTimeBasedGymExerciseType,
} from '../../../modules/training/helpers/gymExerciseDefaults.helper';

export const effectiveWorkoutExercises = (draft: ActiveWorkoutDraft, base: WorkoutTemplateExerciseWithDetails[]) => [
  ...base.filter(item => !draft.adhocExercises.some(local => local.exercise_id === item.exercise_id)),
  ...draft.adhocExercises,
];

/** Resolve at rest completion: the order may have changed while resting. */
export function nextWorkoutAutoSet(
  draft: ActiveWorkoutDraft,
  exercises: WorkoutTemplateExerciseWithDetails[],
  currentId: string,
  nextNumber: number,
) {
  const ids = draft.exerciseOrder.filter(id => !draft.hiddenExercises.includes(id));
  const start = ids.indexOf(currentId);
  if (start < 0) return null;
  for (let index = start; index < ids.length; index++) {
    const exercise = exercises.find(item => item.exercise_id === ids[index]);
    if (!exercise) return null;
    const total = Math.max(0, (exercise.target_sets ?? 3) + (draft.extraSets[exercise.exercise_id] ?? 0));
    for (let number = index === start ? nextNumber : 1; number <= total; number++) {
      if (draft.completedSets.includes(`${exercise.exercise_id}-${number}`)) continue;
      if (!isTimeBasedGymExerciseType(exercise.exercise?.exercise_type_code)) return null;
      return { exercise, setNumber: number };
    }
  }
  return null;
}

export function addWorkoutExercise(
  draft: ActiveWorkoutDraft,
  exercise: WorkoutTemplateExerciseWithDetails,
): ActiveWorkoutDraft {
  if (draft.exerciseOrder.includes(exercise.exercise_id)) return draft;
  const inputs = { ...draft.inputs };
  for (let number = 1; number <= (exercise.target_sets ?? 3); number++) {
    inputs[`${exercise.exercise_id}-${number}`] = { weight: '', reps: String(exercise.target_reps_min ?? '') };
  }
  return {
    ...draft,
    inputs,
    adhocExercises: [...draft.adhocExercises, exercise],
    exerciseOrder: [...draft.exerciseOrder, exercise.exercise_id],
  };
}

export function workoutBlocks(draft: ActiveWorkoutDraft): string[][] {
  const ids = draft.exerciseOrder.filter(id => !draft.hiddenExercises.includes(id));
  const blocks: string[][] = [];
  ids.forEach((id, index) => {
    if (index > 0 && draft.supersetLinks.includes(`${ids[index - 1]}|${id}`)) blocks[blocks.length - 1].push(id);
    else blocks.push([id]);
  });
  return blocks;
}

export function moveWorkoutBlock(draft: ActiveWorkoutDraft, from: number, to: number): ActiveWorkoutDraft {
  const blocks = workoutBlocks(draft);
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return draft;
  const [block] = blocks.splice(from, 1);
  blocks.splice(to, 0, block);
  return { ...draft, exerciseOrder: blocks.flat() };
}

export function detachWorkoutExercise(draft: ActiveWorkoutDraft, id: string): ActiveWorkoutDraft {
  return { ...draft, supersetLinks: draft.supersetLinks.filter(link => !link.split('|').includes(id)) };
}

export function substitutionBlockReason(
  draft: ActiveWorkoutDraft,
  id: string,
  savedExerciseIds: string[],
  executingId: string | null,
) {
  if (executingId === id) return 'replacementTimerBlocked';
  if (savedExerciseIds.includes(id) || draft.completedSets.some(key => key.startsWith(`${id}-`)))
    return 'replacementCompletedBlocked';
  return null;
}

export function substituteWorkoutExercise(
  draft: ActiveWorkoutDraft,
  exercises: WorkoutTemplateExerciseWithDetails[],
  id: string,
  replacement: ExerciseWithDetails,
  savedExerciseIds: string[],
  executingId: string | null,
): ActiveWorkoutDraft {
  const reason = substitutionBlockReason(draft, id, savedExerciseIds, executingId);
  if (reason) throw new Error(reason);
  if (draft.exerciseOrder.includes(replacement.id) && !draft.hiddenExercises.includes(replacement.id)) {
    throw new Error('exerciseAlreadyInSession');
  }
  const source = exercises.find(item => item.exercise_id === id);
  if (!source || draft.hiddenExercises.includes(id)) throw new Error('replacementUnavailable');
  const compatible =
    isTimeBasedGymExerciseType(source.exercise?.exercise_type_code) ===
    isTimeBasedGymExerciseType(replacement.exercise_type_code);
  const targets = getDefaultGymExerciseTargets(replacement.exercise_type_code);
  const nextExercise: WorkoutTemplateExerciseWithDetails = {
    ...source,
    id: `local-${replacement.id}`,
    exercise_id: replacement.id,
    exercise: replacement,
    target_weight_kg: 0,
    superset_next_exercise_id: null,
    ...(!compatible ? { ...targets, is_warmup: false, drop_set_mode: 'none' as const } : {}),
  };
  const inputs = { ...draft.inputs };
  const setModes = { ...draft.setModes };
  Object.keys(inputs)
    .filter(key => key.startsWith(`${id}-`))
    .forEach(key => delete inputs[key]);
  Object.keys(setModes)
    .filter(key => key.startsWith(`${id}-`))
    .forEach(key => delete setModes[key]);
  const count = Math.max(0, (source.target_sets ?? 3) + (draft.extraSets[id] ?? 0));
  for (let number = 1; number <= count; number++) {
    const oldKey = `${id}-${number}`;
    const newKey = `${replacement.id}-${number}`;
    inputs[newKey] = {
      weight: '',
      reps: compatible
        ? (draft.inputs[oldKey]?.reps ?? String(source.target_reps_min ?? targets.target_reps_min))
        : String(targets.target_reps_min),
    };
    setModes[newKey] = compatible ? (draft.setModes[oldKey] ?? 'normal') : 'normal';
  }
  const extraSets = { ...draft.extraSets, [replacement.id]: draft.extraSets[id] ?? 0 };
  delete extraSets[id];
  return {
    ...draft,
    inputs,
    setModes,
    extraSets,
    adhocExercises: [
      ...draft.adhocExercises.filter(item => item.exercise_id !== id && item.exercise_id !== replacement.id),
      nextExercise,
    ],
    hiddenExercises: [...new Set([...draft.hiddenExercises.filter(value => value !== replacement.id), id])],
    exerciseOrder: draft.exerciseOrder
      .filter(value => value !== replacement.id)
      .map(value => (value === id ? replacement.id : value)),
    supersetLinks: draft.supersetLinks.map(link =>
      link
        .split('|')
        .map(value => (value === id ? replacement.id : value))
        .join('|'),
    ),
  };
}
