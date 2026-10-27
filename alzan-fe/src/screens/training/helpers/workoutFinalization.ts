import type { ActiveWorkoutDraft } from './activeWorkoutDraft';
import { isTimeBasedGymExerciseType } from '../../../modules/training/helpers/gymExerciseDefaults.helper';

export function getWorkoutSetMetricValue(
  set: { reps: number | null; duration_s?: number | null },
  exerciseTypeCode: string | null | undefined,
): number | null {
  return isTimeBasedGymExerciseType(exerciseTypeCode) ? (set.duration_s ?? set.reps) : set.reps;
}

export function getWorkoutSetMetrics(
  value: number,
  exerciseTypeCode: string | null | undefined,
  existingSet?: { duration_s?: number | null },
): { reps: number | null; duration_s: number | null } {
  return isTimeBasedGymExerciseType(exerciseTypeCode)
    ? { reps: null, duration_s: value }
    : { reps: value, duration_s: existingSet?.duration_s ?? null };
}

export function createWorkoutSetId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function prepareWorkoutSetIds(
  draft: ActiveWorkoutDraft,
  saved: { exercise_id: string; set_number: number; id: string }[],
  createId = createWorkoutSetId,
): ActiveWorkoutDraft {
  const setIds = { ...draft.setIds };
  saved.forEach(set => {
    setIds[`${set.exercise_id}-${set.set_number}`] = set.id;
  });
  draft.completedSets.forEach(key => {
    setIds[key] ??= createId();
  });
  return { ...draft, setIds };
}

export async function saveWorkoutSequentially<T>(sets: T[], save: (set: T) => Promise<unknown>) {
  for (const set of sets) await save(set);
}
