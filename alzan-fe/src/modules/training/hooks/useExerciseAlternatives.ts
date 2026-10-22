import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { useExercises } from '../../../hooks/useExercises';
import type { ExerciseWithDetails } from '../../../types/training';
import { toAlternativeCandidate } from '../helpers/exerciseAlternatives';
import { fetchExerciseAlternatives } from '../services/exerciseAlternativesService';

export const useExerciseAlternatives = (
  source: ExerciseWithDetails | undefined,
  excludedIds: readonly string[],
  enabled: boolean,
) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const candidate = useMemo(() => (source ? toAlternativeCandidate(source) : undefined), [source]);
  const suggestions = useQuery({
    queryKey: ['exercise-alternatives', user?.id, candidate, [...excludedIds].sort()],
    queryFn: () => {
      if (!user || !candidate) throw new Error('exercise_alternatives_requires_source');
      return fetchExerciseAlternatives(user.id, candidate, excludedIds);
    },
    enabled: enabled && !!user && !!candidate,
    staleTime: 30_000,
    retry: false,
  });
  const ids = useMemo(
    () => (enabled ? (suggestions.data ?? []).map(item => item.exerciseId) : []),
    [enabled, suggestions.data],
  );
  const details = useExercises({ exerciseIds: ids });
  const alternatives = useMemo(() => {
    const byId = new Map(details.exercises.map(exercise => [exercise.id, exercise]));
    return (suggestions.data ?? []).flatMap(suggestion => {
      const exercise = byId.get(suggestion.exerciseId);
      return exercise && !excludedIds.includes(exercise.id) ? [{ exercise, reasons: suggestion.reasons }] : [];
    });
  }, [suggestions.data, details.exercises, excludedIds]);
  const error = suggestions.error ?? details.error;
  return {
    alternatives: error ? [] : alternatives,
    isLoading: enabled && (suggestions.isLoading || details.isLoading),
    error,
    retry: () =>
      Promise.all([suggestions.refetch(), queryClient.invalidateQueries({ queryKey: ['exercises', user?.id] })]),
  };
};
