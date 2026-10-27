import { supabase } from '../../../lib/supabaseClient';
import type { Json } from '../../../types/database.types';
import {
  applyStrengthProgressionBundleForDate,
  loadStrengthProgressionsOrBase,
  type StrengthProgressionBundle,
  type StrengthProgressionTarget,
} from '../helpers/strengthProgression.helper';
import { parseTargetRirBySet } from '../helpers/targetRirBySet.helper';

type StrengthProgressionLoader = (templateId: string) => Promise<StrengthProgressionBundle>;

type DatabaseStrengthProgressionBundle = Omit<StrengthProgressionBundle, 'progressions'> & {
  progressions: Array<
    Omit<StrengthProgressionBundle['progressions'][number], 'target_rir_by_set'> & {
      target_rir_by_set: Json | null;
    }
  >;
};

const loadStrengthProgressionBundle: StrengthProgressionLoader = async templateId => {
  const { data, error } = await supabase
    .from('workout_templates')
    .select(
      `
        recurrence_start_date,
        recurrence_end_date,
        progressions:workout_template_exercise_progressions(
          workout_template_exercise_id,
          week_index,
          target_sets,
          target_reps_min,
          target_reps_max,
          target_weight_kg,
          target_rpe,
          target_rir_by_set,
          rest_seconds
        )
      `,
    )
    .eq('id', templateId)
    .returns<DatabaseStrengthProgressionBundle[]>()
    .single();

  if (error) throw error;
  return {
    ...data,
    progressions: data.progressions.map(progression => ({
      ...progression,
      target_rir_by_set: parseTargetRirBySet(progression.target_rir_by_set, progression.target_sets),
    })),
  };
};

export const applyStrengthProgressionsForPlannedDate = async <TExercise extends StrengthProgressionTarget>(
  templateId: string,
  plannedDate: string,
  exercises: TExercise[],
  loadBundle: StrengthProgressionLoader = loadStrengthProgressionBundle,
): Promise<TExercise[]> => {
  return loadStrengthProgressionsOrBase(
    exercises,
    async () => {
      const data = await loadBundle(templateId);
      return applyStrengthProgressionBundleForDate(exercises, data, plannedDate);
    },
    error => {
      console.error('[strengthProgressionService] Could not load progressions; using base targets.', error);
    },
  );
};
