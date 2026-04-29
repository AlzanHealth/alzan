import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { Exercise } from '../types/requests.types';
import { ExerciseWithDetails } from '../types/training';
import { Locale } from '../i18n';
import {
  buildLooseIlikePattern,
  buildTokenIlikeClauses,
  getCurrentAppLocale,
  getLocalizedExerciseDescription,
  getLocalizedExerciseName,
  getSearchRelevanceScore,
  matchesLoosely,
  normalizeExerciseLoadType,
  normalizeSearchText,
} from '../services/localization';

interface TranslationRow {
  name: string;
  language_code: string | null;
}

interface ExerciseLookupRow extends Exercise {
  load_type: 'bodyweight' | 'external' | 'assisted' | 'mixed' | null;
  exercise_type: {
    id: number;
    code: string;
  } | null;
  primary_muscle: {
    id: number;
    code: string;
    muscle_group_translations: TranslationRow[] | null;
  } | null;
  secondary_muscle: {
    id: number;
    code: string;
    muscle_group_translations: TranslationRow[] | null;
  } | null;
  equipment: {
    id: number;
    code: string;
    equipment_translations: TranslationRow[] | null;
  } | null;
}

const EXERCISE_LOOKUP_SELECT = `
  *,
  exercise_type:exercise_types (
    id,
    code
  ),
  primary_muscle:muscle_groups!exercises_primary_muscle_id_fkey (
    id,
    code,
    muscle_group_translations (
      name,
      language_code
    )
  ),
  secondary_muscle:muscle_groups!exercises_secondary_muscle_id_fkey (
    id,
    code,
    muscle_group_translations (
      name,
      language_code
    )
  ),
  equipment (
    id,
    code,
    equipment_translations (
      name,
      language_code
    )
  )
`;

const SEARCH_QUERY_TIMEOUT_MS = 7000;
const SEARCH_CANDIDATE_MULTIPLIER = 6;
const SEARCH_CANDIDATE_FLOOR = 90;

const withTimeout = async <T>(promiseLike: PromiseLike<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Exercise search timed out'));
      }, timeoutMs);
    });

    return await Promise.race([Promise.resolve(promiseLike), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const buildExerciseSearchClauses = (query: string): string[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const looseLikePattern = buildLooseIlikePattern(query).replace(/['"()]/g, '');
  const startsWithPattern = `${looseLikePattern}%`;

  const tokenClauses = buildTokenIlikeClauses(query, [
    'base_name_es',
    'base_name_en',
    'description_es',
    'description_en',
  ]);

  return Array.from(
    new Set([
      `base_name_es.ilike.${startsWithPattern}`,
      `base_name_en.ilike.${startsWithPattern}`,
      `base_name_es.ilike.%${looseLikePattern}%`,
      `base_name_en.ilike.%${looseLikePattern}%`,
      ...tokenClauses,
    ]),
  );
};

interface UseExercisesOptions {
  searchQuery?: string;
  selectedMuscleId?: number | null;
  selectedEquipmentId?: number | null;
  limit?: number;
}

const mapExerciseLookupRow = (item: ExerciseLookupRow, languageCode: Locale): ExerciseWithDetails => {
  // For muscles and equipment, filter translations by language_code
  const muscleTranslations = item.primary_muscle?.muscle_group_translations || [];
  const muscleTrans = muscleTranslations.find(t => t.language_code === languageCode) || muscleTranslations[0];

  const secondaryMuscleTranslations = item.secondary_muscle?.muscle_group_translations || [];
  const secondaryMuscleTrans =
    secondaryMuscleTranslations.find(t => t.language_code === languageCode) || secondaryMuscleTranslations[0];

  const equipTranslations = item.equipment?.equipment_translations || [];
  const equipTrans = equipTranslations.find(t => t.language_code === languageCode) || equipTranslations[0];

  const muscleName = muscleTrans?.name || item.primary_muscle?.code || undefined;
  const secondaryMuscleName = secondaryMuscleTrans?.name || item.secondary_muscle?.code || undefined;
  const equipName = equipTrans?.name || item.equipment?.code || undefined;
  const exerciseName = getLocalizedExerciseName(item, languageCode);
  const exerciseDescription = getLocalizedExerciseDescription(item, languageCode);

  return {
    ...item,
    load_type: normalizeExerciseLoadType(item.load_type),
    name: exerciseName,
    description: exerciseDescription ?? item.description_es ?? null,
    muscle_name: muscleName,
    secondary_muscle_name: secondaryMuscleName,
    equipment_name: equipName,
    // Exercise type code for time-based vs reps-based exercises
    exercise_type_code: item.exercise_type?.code || null,
    // Preserve primary_muscle object with translated name for ExerciseDetailScreen
    primary_muscle: item.primary_muscle
      ? {
          id: item.primary_muscle.id,
          code: item.primary_muscle.code,
          name: muscleName || item.primary_muscle.code,
        }
      : null,
    // Preserve secondary_muscle object with translated name
    secondary_muscle: item.secondary_muscle
      ? {
          id: item.secondary_muscle.id,
          code: item.secondary_muscle.code,
          name: secondaryMuscleName || item.secondary_muscle.code,
        }
      : null,
    // Preserve equipment object with translated name
    equipment: item.equipment
      ? {
          id: item.equipment.id,
          code: item.equipment.code,
          name: equipName || item.equipment.code,
        }
      : null,
  };
};

export const useExercises = (options?: UseExercisesOptions) => {
  const languageCode = getCurrentAppLocale();
  const trimmedSearchQuery = options?.searchQuery?.trim() ?? '';
  const normalizedSearchQuery = normalizeSearchText(trimmedSearchQuery);
  const shouldSearch = normalizedSearchQuery.length >= 2;
  const selectedMuscleId = options?.selectedMuscleId ?? null;
  const selectedEquipmentId = options?.selectedEquipmentId ?? null;
  const limit = options?.limit;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['exercises', languageCode, normalizedSearchQuery, selectedMuscleId, selectedEquipmentId, limit ?? 'all'],
    queryFn: async () => {
      const createBaseQuery = () => {
        let query = supabase.from('exercises').select(EXERCISE_LOOKUP_SELECT);

        if (selectedMuscleId !== null) {
          query = query.eq('primary_muscle_id', selectedMuscleId);
        }

        if (selectedEquipmentId !== null) {
          query = query.eq('equipment_id', selectedEquipmentId);
        }

        return query;
      };

      let rows: ExerciseLookupRow[] = [];

      if (shouldSearch) {
        const requestedLimit = typeof limit === 'number' && limit > 0 ? limit : SEARCH_CANDIDATE_FLOOR;
        const candidateLimit = Math.max(requestedLimit * SEARCH_CANDIDATE_MULTIPLIER, SEARCH_CANDIDATE_FLOOR);
        const searchClauses = buildExerciseSearchClauses(trimmedSearchQuery);

        let query = createBaseQuery().order('id', { ascending: true }).limit(candidateLimit);

        if (searchClauses.length > 0) {
          query = query.or(searchClauses.join(','));
        }

        try {
          const { data, error } = await withTimeout(query.returns<ExerciseLookupRow[]>(), SEARCH_QUERY_TIMEOUT_MS);

          if (error) {
            console.error('Error fetching exercises:', error);
            return {
              exercises: [],
              hasMore: false,
            };
          }

          rows = data || [];
        } catch (searchError) {
          console.error('Exercise search timed out or failed:', searchError);
          return {
            exercises: [],
            hasMore: false,
          };
        }
      } else {
        let query = createBaseQuery().order('id', { ascending: true });

        if (typeof limit === 'number' && limit > 0) {
          query = query.limit(limit);
        }

        const { data, error } = await query.returns<ExerciseLookupRow[]>();

        if (error) {
          console.error('Error fetching exercises:', error);
          throw error;
        }

        rows = data || [];
      }

      const mappedExercises = rows.map(item => mapExerciseLookupRow(item, languageCode));

      if (!shouldSearch) {
        return {
          exercises: mappedExercises,
          hasMore: typeof limit === 'number' ? mappedExercises.length >= limit : false,
        };
      }

      const filteredAndSorted = mappedExercises
        .filter(exercise =>
          matchesLoosely(
            trimmedSearchQuery,
            exercise.name,
            exercise.base_name,
            exercise.base_name_es,
            exercise.base_name_en,
            exercise.description,
            exercise.description_es,
            exercise.description_en,
            exercise.muscle_name,
            exercise.secondary_muscle_name,
            exercise.equipment_name,
          ),
        )
        .sort((a, b) => {
          const scoreA = getSearchRelevanceScore(
            trimmedSearchQuery,
            a.name,
            a.base_name,
            a.base_name_es,
            a.base_name_en,
            a.description,
            a.description_es,
            a.description_en,
            a.muscle_name,
            a.secondary_muscle_name,
            a.equipment_name,
          );
          const scoreB = getSearchRelevanceScore(
            trimmedSearchQuery,
            b.name,
            b.base_name,
            b.base_name_es,
            b.base_name_en,
            b.description,
            b.description_es,
            b.description_en,
            b.muscle_name,
            b.secondary_muscle_name,
            b.equipment_name,
          );

          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }

          return (a.name || '').localeCompare(b.name || '');
        });

      if (typeof limit === 'number' && limit > 0) {
        return {
          exercises: filteredAndSorted.slice(0, limit),
          hasMore: filteredAndSorted.length > limit,
        };
      }

      return {
        exercises: filteredAndSorted,
        hasMore: false,
      };
    },
    staleTime: 1000 * 60 * 5, // Reduced to 5 minutes so new exercises appear sooner
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    retry: false,
    placeholderData: previousData => previousData,
  });

  return {
    exercises: data?.exercises ?? [],
    hasMore: data?.hasMore ?? false,
    isLoading,
    isFetching,
    error,
  };
};

export const useExerciseById = (exerciseId?: string) => {
  const languageCode = getCurrentAppLocale();

  const {
    data: exercise = null,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['exercise-by-id', exerciseId, languageCode],
    queryFn: async () => {
      if (!exerciseId) return null;

      const { data, error } = await supabase
        .from('exercises')
        .select(EXERCISE_LOOKUP_SELECT)
        .eq('id', exerciseId)
        .returns<ExerciseLookupRow[]>()
        .maybeSingle();

      if (error) {
        console.error('Error fetching exercise by id:', error);
        throw error;
      }

      if (!data) return null;
      return mapExerciseLookupRow(data, languageCode);
    },
    enabled: !!exerciseId,
    staleTime: 1000 * 60 * 5,
  });

  return {
    exercise,
    isLoading,
    error,
  };
};
