import { supabase } from '../../../lib/supabaseClient';
import type { Exercise } from '../../../types/requests.types';
import { fetchExerciseUserOverrides } from './exerciseCatalogService';
import { loadAllPages } from '../helpers/loadAllPages';
import {
  rankExerciseAlternatives,
  type AlternativeCandidate,
  type ExerciseAlternative,
} from '../helpers/exerciseAlternatives';

interface CandidateRow extends Pick<
  Exercise,
  | 'id'
  | 'base_name_es'
  | 'base_name_en'
  | 'primary_muscle_id'
  | 'secondary_muscle_id'
  | 'equipment_id'
  | 'load_type'
  | 'archived_at'
> {
  exercise_type: { code: string } | null;
}
const CANDIDATE_SELECT =
  'id, base_name_es, base_name_en, primary_muscle_id, secondary_muscle_id, equipment_id, load_type, archived_at, exercise_type:exercise_types(code)';

export const fetchExerciseAlternatives = async (
  userId: string,
  source: AlternativeCandidate,
  excludedIds: readonly string[],
): Promise<ExerciseAlternative[]> => {
  if (!userId) return [];
  const [overrides, sourceResult] = await Promise.all([
    fetchExerciseUserOverrides(userId),
    supabase
      .from('exercises')
      .select(CANDIDATE_SELECT)
      .eq('id', source.id)
      .is('archived_at', null)
      .returns<CandidateRow[]>()
      .maybeSingle(),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  if (!sourceResult.data) return [];
  const overrideById = new Map(overrides.map(override => [override.exercise_id, override]));
  const toCandidate = (row: CandidateRow): AlternativeCandidate => {
    const override = overrideById.get(row.id);
    return {
      id: row.id,
      names: [row.base_name_es, row.base_name_en ?? ''],
      primaryMuscleId: override ? override.primary_muscle_id : row.primary_muscle_id,
      secondaryMuscleId: override ? override.secondary_muscle_id : row.secondary_muscle_id,
      equipmentId: override ? override.equipment_id : row.equipment_id,
      loadType: override ? override.load_type : row.load_type,
      exerciseTypeCode: row.exercise_type?.code,
      archived: !!row.archived_at,
    };
  };
  // Resolve the source from the server too: session aliases are presentation
  // data, and must not be interpreted as a different movement pattern.
  const effectiveSource = toCandidate(sourceResult.data);
  const primaryMuscleId = effectiveSource.primaryMuscleId;
  if (!primaryMuscleId) return [];
  // Fetch narrow candidate columns only; the existing hook hydrates the best
  // twelve. RLS remains authoritative for canonical and personal exercises.
  const rows = await loadAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from('exercises')
      .select(CANDIDATE_SELECT)
      .is('archived_at', null)
      .eq('primary_muscle_id', primaryMuscleId)
      .order('id')
      .range(from, to)
      .returns<CandidateRow[]>();
    if (error) throw error;
    return data ?? [];
  }, 500);
  const knownIds = new Set(rows.map(row => row.id));
  const movedIntoMuscleIds = overrides
    .filter(override => override.primary_muscle_id === primaryMuscleId && !knownIds.has(override.exercise_id))
    .map(override => override.exercise_id);
  for (let offset = 0; offset < movedIntoMuscleIds.length; offset += 500) {
    const { data, error } = await supabase
      .from('exercises')
      .select(CANDIDATE_SELECT)
      .is('archived_at', null)
      .in('id', movedIntoMuscleIds.slice(offset, offset + 500))
      .returns<CandidateRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rankExerciseAlternatives(effectiveSource, rows.map(toCandidate), new Set(excludedIds));
};
