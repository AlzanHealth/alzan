import { useQuery } from '@tanstack/react-query';
import { canReuseExerciseSearchPage, getExerciseSearchFields } from '../modules/training/helpers/exerciseSearchState';
import { supabase } from '../lib/supabaseClient';
import { Exercise } from '../types/requests.types';
import { ExerciseWithDetails } from '../types/training';
import { loadAllPages } from '../modules/training/helpers/loadAllPages';
import { Locale } from '../i18n';
import { useAuth } from '../context/AuthContext';
import { fetchExerciseUserOverrides, ExerciseUserOverride } from '../modules/training/services/exerciseCatalogService';
import { exerciseCatalogQueryKey } from '../modules/training/helpers/exerciseCatalogMatching';
import {
  buildLooseIlikePattern,
  buildTokenIlikeClauses,
  foldAccentsToWildcard,
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

type RankedExerciseRow = {
  id: string;
  search_rank: number;
};

type SearchExercisesRankedRpc = {
  rpc: (
    fn: 'search_exercises_ranked',
    args: {
      p_query: string;
      p_locale: string;
      p_muscle_id: number | null;
      p_equipment_id: number | null;
      p_limit: number;
    },
  ) => Promise<{ data: RankedExerciseRow[] | null; error: { message: string } | null }>;
};

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

// Search exercise names only. Descriptions are long and cause false matches
// (e.g. "flex" hitting any description that says "flexiona…"). Muscle/equipment
// have their own dedicated filters.
//
// "Strong" clauses represent the whole query (prefix + in-order loose match).
// They match few rows, so fetching them first guarantees the typed term surfaces
// instead of being crowded out of the limited, id-ordered candidate window.
const buildExerciseStrongClauses = (query: string): string[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  // Fold accents to `_`: exercises have no normalized name column, so this keeps
  // "frances" matching "Press francés". matchesLoosely re-checks precision.
  const looseLikePattern = foldAccentsToWildcard(buildLooseIlikePattern(query).replace(/['"()]/g, ''));
  return Array.from(
    new Set([
      `base_name_es.ilike.${looseLikePattern}%`,
      `base_name_en.ilike.${looseLikePattern}%`,
      `base_name_es.ilike.%${looseLikePattern}%`,
      `base_name_en.ilike.%${looseLikePattern}%`,
    ]),
  );
};

// "Broad" clauses match each token independently (order-independent recall),
// also accent-folded so single accented words (e.g. "triceps") are found.
const buildExerciseBroadClauses = (query: string): string[] =>
  buildTokenIlikeClauses(query, ['base_name_es', 'base_name_en'], foldAccentsToWildcard);

interface UseExercisesOptions {
  searchQuery?: string;
  selectedMuscleId?: number | null;
  selectedEquipmentId?: number | null;
  exerciseIds?: string[];
  ownerUserId?: string;
  limit?: number;
  includeArchived?: boolean;
}

const mapExerciseLookupRow = (
  item: ExerciseLookupRow,
  languageCode: Locale,
  override?: ExerciseUserOverride,
): ExerciseWithDetails => {
  const effectiveItem: ExerciseLookupRow = override
    ? {
        ...item,
        base_name_es: override.base_name_es,
        base_name_en: override.base_name_en,
        description_es: override.description_es,
        description_en: override.description_en,
        primary_muscle_id: override.primary_muscle_id,
        secondary_muscle_id: override.secondary_muscle_id,
        equipment_id: override.equipment_id,
        load_type: override.load_type,
        primary_muscle: override.primary_muscle,
        secondary_muscle: override.secondary_muscle,
        equipment: override.equipment,
      }
    : item;

  // For muscles and equipment, filter translations by language_code
  const muscleTranslations = effectiveItem.primary_muscle?.muscle_group_translations || [];
  const muscleTrans = muscleTranslations.find(t => t.language_code === languageCode) || muscleTranslations[0];

  const secondaryMuscleTranslations = effectiveItem.secondary_muscle?.muscle_group_translations || [];
  const secondaryMuscleTrans =
    secondaryMuscleTranslations.find(t => t.language_code === languageCode) || secondaryMuscleTranslations[0];

  const equipTranslations = effectiveItem.equipment?.equipment_translations || [];
  const equipTrans = equipTranslations.find(t => t.language_code === languageCode) || equipTranslations[0];

  const muscleName = muscleTrans?.name || effectiveItem.primary_muscle?.code || undefined;
  const secondaryMuscleName = secondaryMuscleTrans?.name || effectiveItem.secondary_muscle?.code || undefined;
  const equipName = equipTrans?.name || effectiveItem.equipment?.code || undefined;
  const exerciseName = getLocalizedExerciseName(effectiveItem, languageCode);
  const exerciseDescription = getLocalizedExerciseDescription(effectiveItem, languageCode);

  return {
    ...effectiveItem,
    load_type: normalizeExerciseLoadType(effectiveItem.load_type),
    name: exerciseName,
    canonical_name_es: item.base_name_es,
    canonical_name_en: item.base_name_en,
    description: exerciseDescription ?? effectiveItem.description_es ?? null,
    muscle_name: muscleName,
    secondary_muscle_name: secondaryMuscleName,
    equipment_name: equipName,
    // Exercise type code for time-based vs reps-based exercises
    exercise_type_code: item.exercise_type?.code || null,
    is_personalized: !!override,
    // Preserve primary_muscle object with translated name for ExerciseDetailScreen
    primary_muscle: effectiveItem.primary_muscle
      ? {
          id: effectiveItem.primary_muscle.id,
          code: effectiveItem.primary_muscle.code,
          name: muscleName || effectiveItem.primary_muscle.code,
        }
      : null,
    // Preserve secondary_muscle object with translated name
    secondary_muscle: effectiveItem.secondary_muscle
      ? {
          id: effectiveItem.secondary_muscle.id,
          code: effectiveItem.secondary_muscle.code,
          name: secondaryMuscleName || effectiveItem.secondary_muscle.code,
        }
      : null,
    // Preserve equipment object with translated name
    equipment: effectiveItem.equipment
      ? {
          id: effectiveItem.equipment.id,
          code: effectiveItem.equipment.code,
          name: equipName || effectiveItem.equipment.code,
        }
      : null,
  };
};

export const useExercises = (options?: UseExercisesOptions) => {
  const { user } = useAuth();
  const userId = user?.id;
  const languageCode = getCurrentAppLocale();
  const trimmedSearchQuery = options?.searchQuery?.trim() ?? '';
  const normalizedSearchQuery = normalizeSearchText(trimmedSearchQuery);
  const shouldSearch = normalizedSearchQuery.length >= 2;
  const selectedMuscleId = options?.selectedMuscleId ?? null;
  const selectedEquipmentId = options?.selectedEquipmentId ?? null;
  const exerciseIds = options?.exerciseIds;
  const ownerUserId = options?.ownerUserId;
  const exerciseIdsKey = exerciseIds?.join(',') ?? 'all';
  const limit = options?.limit;
  const includeArchived = options?.includeArchived ?? false;

  const queryKey = [
    'exercises',
    userId,
    languageCode,
    exerciseCatalogQueryKey(trimmedSearchQuery),
    selectedMuscleId,
    selectedEquipmentId,
    exerciseIdsKey,
    ownerUserId ?? 'all-owners',
    limit ?? 'all',
    includeArchived,
  ];

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey,
    placeholderData: (previousData, previousQuery) =>
      canReuseExerciseSearchPage(previousQuery?.queryKey, queryKey) ? previousData : undefined,
    queryFn: async () => {
      if (exerciseIds !== undefined && exerciseIds.length === 0) {
        return { exercises: [], fuzzyCandidates: [], hasMore: false };
      }

      const createBaseQuery = () => {
        let query = supabase.from('exercises').select(EXERCISE_LOOKUP_SELECT);

        if (exerciseIds !== undefined) {
          query = query.in('id', exerciseIds);
        }

        if (ownerUserId) {
          query = query.eq('owner_user_id', ownerUserId).eq('is_custom', true);
        }

        if (!includeArchived) {
          query = query.is('archived_at', null);
        }

        return query;
      };

      let rows: ExerciseLookupRow[] = [];
      let useOverrideSearchFallback = false;
      let fallbackUserOverrides: ExerciseUserOverride[] = [];

      if (shouldSearch) {
        const requestedLimit = typeof limit === 'number' && limit > 0 ? limit : SEARCH_CANDIDATE_FLOOR;
        const candidateLimit = Math.max(requestedLimit * SEARCH_CANDIDATE_MULTIPLIER, SEARCH_CANDIDATE_FLOOR);

        // Two-phase fetch: strong (whole-query) matches first so the typed term
        // always surfaces, then broad token matches to fill the remaining slots.
        const runExerciseSearch = async (
          orClauses: string[],
          excludeIds: string[] = [],
        ): Promise<ExerciseLookupRow[]> => {
          if (orClauses.length === 0) return [];

          let query = createBaseQuery().order('id', { ascending: true }).limit(candidateLimit).or(orClauses.join(','));

          if (excludeIds.length > 0) {
            query = query.not('id', 'in', `(${excludeIds.join(',')})`);
          }

          const { data, error } = await withTimeout(query.returns<ExerciseLookupRow[]>(), SEARCH_QUERY_TIMEOUT_MS);
          if (error) {
            console.error('Error fetching exercises:', error);
            throw error;
          }
          return data || [];
        };

        if (ownerUserId) {
          // The ranked RPC searches the shared catalog too. For “Míos”, keep
          // the database query scoped to this owner so a large global result
          // set cannot crowd out personal exercises or make the screen heavy.
          const strongRows = await runExerciseSearch(buildExerciseStrongClauses(trimmedSearchQuery));
          rows = strongRows;

          if (strongRows.length < requestedLimit) {
            const broadRows = await runExerciseSearch(
              buildExerciseBroadClauses(trimmedSearchQuery),
              strongRows.map(row => row.id),
            );
            rows = [...strongRows, ...broadRows];
          }
        } else {
          const { data: rankedExercises, error: rankedError } = await (
            supabase as unknown as SearchExercisesRankedRpc
          ).rpc('search_exercises_ranked', {
            p_query: trimmedSearchQuery,
            p_locale: languageCode,
            p_muscle_id: selectedMuscleId,
            p_equipment_id: selectedEquipmentId,
            p_limit: candidateLimit,
          });

          if (!rankedError && rankedExercises) {
            const rankedIds = rankedExercises.map(item => item.id);
            const allowedExerciseIds = exerciseIds === undefined ? null : new Set(exerciseIds);
            const matchingRankedIds = allowedExerciseIds
              ? rankedIds.filter(id => allowedExerciseIds.has(id))
              : rankedIds;
            if (matchingRankedIds.length === 0) {
              return { exercises: [], fuzzyCandidates: [], hasMore: false };
            }

            let detailsQuery = supabase.from('exercises').select(EXERCISE_LOOKUP_SELECT).in('id', matchingRankedIds);

            if (!includeArchived) {
              detailsQuery = detailsQuery.is('archived_at', null);
            }

            const { data: details, error: detailsError } = await detailsQuery.returns<ExerciseLookupRow[]>();

            if (detailsError) {
              console.error('Error fetching ranked exercises:', detailsError);
              useOverrideSearchFallback = true;
            } else {
              const detailsById = new Map((details ?? []).map(item => [item.id, item]));
              rows = matchingRankedIds
                .map(id => detailsById.get(id))
                .filter((item): item is ExerciseLookupRow => !!item);
            }
          } else if (rankedError) {
            console.error('Exercise ranked search RPC failed:', rankedError);
            useOverrideSearchFallback = true;
          }
        }

        if (!ownerUserId && rows.length === 0) {
          try {
            const strongRows = await runExerciseSearch(buildExerciseStrongClauses(trimmedSearchQuery));
            rows = strongRows;

            if (strongRows.length < requestedLimit) {
              const broadRows = await runExerciseSearch(
                buildExerciseBroadClauses(trimmedSearchQuery),
                strongRows.map(row => row.id),
              );
              rows = [...strongRows, ...broadRows];
            }
          } catch (searchError) {
            console.error('Exercise search timed out or failed:', searchError);
            throw searchError;
          }
        }

        if (useOverrideSearchFallback && userId) {
          fallbackUserOverrides = await fetchExerciseUserOverrides(userId);
          const matchingOverrideIds = fallbackUserOverrides
            .filter(override =>
              matchesLoosely(
                trimmedSearchQuery,
                override.base_name_es,
                override.base_name_en,
                override.description_es,
                override.description_en,
              ),
            )
            .map(override => override.exercise_id);
          const missingOverrideIds = matchingOverrideIds.filter(id => !rows.some(row => row.id === id));

          if (missingOverrideIds.length > 0) {
            let overrideDetailsQuery = supabase
              .from('exercises')
              .select(EXERCISE_LOOKUP_SELECT)
              .in('id', missingOverrideIds);

            if (!includeArchived) {
              overrideDetailsQuery = overrideDetailsQuery.is('archived_at', null);
            }

            const { data: overrideDetails, error: overrideDetailsError } =
              await overrideDetailsQuery.returns<ExerciseLookupRow[]>();

            if (overrideDetailsError) throw overrideDetailsError;
            rows = [...rows, ...(overrideDetails ?? [])];
          }
        }
      } else {
        const hasUnfilteredPageLimit =
          typeof limit === 'number' && limit > 0 && selectedMuscleId === null && selectedEquipmentId === null;
        rows = await loadAllPages(
          async (from, to) => {
            // Canonical localized names keep incremental pages stable even when
            // user overrides rename an exercise. ID resolves duplicate names.
            const { data, error } = await createBaseQuery()
              .order(languageCode === 'en' ? 'base_name_en' : 'base_name_es', { ascending: true })
              .order('id', { ascending: true })
              .range(from, to)
              .returns<ExerciseLookupRow[]>();

            if (error) {
              console.error('Error fetching exercises:', error);
              throw error;
            }

            return data ?? [];
          },
          1_000,
          hasUnfilteredPageLimit ? limit + 1 : Number.POSITIVE_INFINITY,
        );
      }

      const rowIds = rows.map(item => item.id);
      const userOverrides =
        fallbackUserOverrides.length > 0
          ? fallbackUserOverrides.filter(override => rowIds.includes(override.exercise_id))
          : userId && rowIds.length > 0
            ? await fetchExerciseUserOverrides(userId, rowIds)
            : [];
      const overridesByExerciseId = new Map(userOverrides.map(override => [override.exercise_id, override]));
      const mappedExercises = rows.map(item =>
        mapExerciseLookupRow(item, languageCode, overridesByExerciseId.get(item.id)),
      );
      const exercisesMatchingFilters = mappedExercises.filter(
        exercise =>
          (selectedMuscleId === null || exercise.primary_muscle_id === selectedMuscleId) &&
          (selectedEquipmentId === null || exercise.equipment_id === selectedEquipmentId),
      );

      if (!shouldSearch) {
        const visibleExercises =
          typeof limit === 'number' && limit > 0 ? exercisesMatchingFilters.slice(0, limit) : exercisesMatchingFilters;
        return {
          exercises: visibleExercises,
          fuzzyCandidates: [],
          hasMore: typeof limit === 'number' ? exercisesMatchingFilters.length > visibleExercises.length : false,
        };
      }

      const filteredAndSorted = exercisesMatchingFilters
        .filter(exercise => matchesLoosely(trimmedSearchQuery, ...getExerciseSearchFields(exercise)))
        .sort((a, b) => {
          const scoreA = getSearchRelevanceScore(trimmedSearchQuery, ...getExerciseSearchFields(a));
          const scoreB = getSearchRelevanceScore(trimmedSearchQuery, ...getExerciseSearchFields(b));

          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }

          return (a.name || '').localeCompare(b.name || '');
        });

      if (typeof limit === 'number' && limit > 0) {
        return {
          exercises: filteredAndSorted.slice(0, limit),
          fuzzyCandidates: exercisesMatchingFilters,
          hasMore: filteredAndSorted.length > limit,
        };
      }

      return {
        exercises: filteredAndSorted,
        fuzzyCandidates: exercisesMatchingFilters,
        hasMore: false,
      };
    },
    staleTime: 1000 * 60 * 5, // Reduced to 5 minutes so new exercises appear sooner
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    retry: false,
  });

  return {
    exercises: data?.exercises ?? [],
    fuzzyCandidates: data?.fuzzyCandidates ?? [],
    hasMore: data?.hasMore ?? false,
    isLoading,
    isFetching,
    error,
  };
};

export const useExerciseById = (exerciseId?: string) => {
  const { user } = useAuth();
  const userId = user?.id;
  const languageCode = getCurrentAppLocale();

  const {
    data: exercise = null,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['exercise-by-id', userId, exerciseId, languageCode],
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
      const overrides = userId ? await fetchExerciseUserOverrides(userId, [data.id]) : [];
      const override = overrides.find(item => item.exercise_id === data.id);
      return mapExerciseLookupRow(data, languageCode, override);
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
