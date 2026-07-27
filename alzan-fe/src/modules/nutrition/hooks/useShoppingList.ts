import { format } from 'date-fns';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../../context/AuthContext';
import { usePreferences } from '../../../hooks/settings/usePreferences';
import { getShoppingCycleRange, normalizeShoppingListStartDay } from '../services/shoppingListPlanner';
import { getShoppingList } from '../services/shoppingListService';

export function useShoppingList(selectedDate: Date | string) {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const selectedDateKey = typeof selectedDate === 'string' ? selectedDate : format(selectedDate, 'yyyy-MM-dd');
  const startDay = normalizeShoppingListStartDay(preferences?.nutrition_prefs?.shopping_list_start_day);
  const selectedRange = useMemo(() => getShoppingCycleRange(selectedDateKey, startDay), [selectedDateKey, startDay]);

  const query = useQuery({
    queryKey: ['shoppingList', user?.id, selectedRange.startDate, selectedRange.endDate, startDay],
    queryFn: () => getShoppingList(user!.id, selectedDateKey, startDay),
    enabled: !!user,
  });

  return {
    ...query,
    startDay,
    range: query.data?.range ?? selectedRange,
    ingredients: query.data?.ingredients ?? [],
  };
}
