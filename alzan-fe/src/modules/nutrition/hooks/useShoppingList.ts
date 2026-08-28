import { format } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../../context/AuthContext';
import { usePreferences } from '../../../hooks/settings/usePreferences';
import {
  getShoppingRange,
  normalizeShoppingListStartDay,
  type ShoppingListMode,
  type ShoppingMealTimes,
} from '../services/shoppingListPlanner';
import {
  getShoppingListCacheKey,
  parseShoppingListResult,
  serializeShoppingListResult,
} from '../services/shoppingListCache';
import { getShoppingList } from '../services/shoppingListService';

type UseShoppingListOptions = {
  mode?: ShoppingListMode;
  customStartDate?: string;
  customEndDate?: string;
  showPast?: boolean;
};

export function useShoppingList(selectedDate: Date | string, options: UseShoppingListOptions = {}) {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const selectedDateKey = typeof selectedDate === 'string' ? selectedDate : format(selectedDate, 'yyyy-MM-dd');
  const startDay = normalizeShoppingListStartDay(preferences?.nutrition_prefs?.shopping_list_start_day);
  const mode = options.mode || 'upcoming';
  const timezone = preferences?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const mealTimes = useMemo<ShoppingMealTimes>(() => {
    const configuredMeals = preferences?.notification_settings?.meals;
    if (!configuredMeals) return {};

    return Object.fromEntries(
      Object.entries(configuredMeals)
        .filter(([, meal]) => typeof meal?.time === 'string')
        .map(([mealType, meal]) => [mealType, meal.time]),
    ) as ShoppingMealTimes;
  }, [preferences?.notification_settings?.meals]);
  const [now, setNow] = useState(() => new Date());
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const selectedRange = useMemo(() => {
    if (mode === 'custom' && (!options.customStartDate || !options.customEndDate)) return null;
    try {
      return getShoppingRange(
        {
          mode,
          selectedDate: selectedDateKey,
          customStartDate: options.customStartDate,
          customEndDate: options.customEndDate,
        },
        startDay,
      );
    } catch {
      return null;
    }
  }, [mode, options.customEndDate, options.customStartDate, selectedDateKey, startDay]);

  const cacheKey = useMemo(
    () =>
      user?.id && selectedRange
        ? getShoppingListCacheKey({
            userId: user.id,
            mode,
            rangeStart: selectedRange.startDate,
            rangeEnd: selectedRange.endDate,
            customStartDate: options.customStartDate,
            customEndDate: options.customEndDate,
            startDay,
            timezone,
            mealTimes,
            showPast: options.showPast,
          })
        : null,
    [
      mealTimes,
      mode,
      options.customEndDate,
      options.customStartDate,
      options.showPast,
      selectedRange,
      startDay,
      timezone,
      user?.id,
    ],
  );
  const [cachedData, setCachedData] = useState<ReturnType<typeof parseShoppingListResult>>(null);

  useEffect(() => {
    let cancelled = false;
    setCacheLoaded(false);
    setIsOffline(false);
    setCachedData(null);
    if (!cacheKey) {
      setCacheLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    void AsyncStorage.getItem(cacheKey)
      .then(value => {
        if (cancelled) return;
        setCachedData(parseShoppingListResult(value));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCacheLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const queryKey = useMemo(
    () => [
      'shoppingList',
      user?.id,
      mode,
      selectedRange?.startDate,
      selectedRange?.endDate,
      options.customStartDate,
      options.customEndDate,
      startDay,
      timezone,
      mealTimes,
      now.toISOString().slice(0, 16),
      options.showPast,
    ],
    [
      mealTimes,
      mode,
      now,
      options.customEndDate,
      options.customStartDate,
      options.showPast,
      selectedRange,
      startDay,
      timezone,
      user?.id,
    ],
  );

  const query = useQuery({
    queryKey,
    placeholderData: cachedData ?? undefined,
    queryFn: async () => {
      try {
        const result = await getShoppingList(user!.id, selectedDateKey, startDay, {
          mode,
          customStartDate: options.customStartDate,
          customEndDate: options.customEndDate,
          now,
          timezone,
          mealTimes,
          showPast: options.showPast,
        });
        setIsOffline(false);
        if (cacheKey) void AsyncStorage.setItem(cacheKey, serializeShoppingListResult(result)).catch(() => undefined);
        return result;
      } catch (error) {
        const fallback =
          cachedData || (cacheKey ? parseShoppingListResult(await AsyncStorage.getItem(cacheKey)) : null);
        if (!fallback) throw error;
        setIsOffline(true);
        return fallback;
      }
    },
    enabled: !!user && !!selectedRange && cacheLoaded,
  });

  return {
    ...query,
    isOffline,
    mode,
    startDay,
    range: query.data?.range ?? selectedRange ?? { startDate: selectedDateKey, endDate: selectedDateKey },
    ingredients: query.data?.ingredients ?? [],
    totalMealCount: query.data?.totalMealCount ?? 0,
    visibleMealCount: query.data?.visibleMealCount ?? 0,
    hiddenMealCount: query.data?.hiddenMealCount ?? 0,
  };
}
