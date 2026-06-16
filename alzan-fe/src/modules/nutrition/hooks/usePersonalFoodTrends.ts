import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { MealType } from '../../../types/requests.types';
import { getPersonalFoodTrends } from '../services/personalTrendsService';

/**
 * Recency-weighted "what you actually use/eat" suggestions.
 * Recipes come first, then meal-slot foods fill the remaining space.
 */
export function usePersonalFoodTrends(mealType?: MealType, limit = 8) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['personalFoodTrends', user?.id, mealType, limit],
    queryFn: () => getPersonalFoodTrends({ mealType, limit }),
    enabled: !!user,
    staleTime: 60_000,
  });
}
