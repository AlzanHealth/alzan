import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  formatNutritionDayDate,
  getMillisecondsUntilNextNutritionDayRollover,
  normalizeNutritionDayRolloverTime,
} from '../services/nutritionDay';

export const useCurrentNutritionDate = (rolloverTime: string | null | undefined): string => {
  const normalizedRolloverTime = normalizeNutritionDayRolloverTime(rolloverTime);
  const [currentNutritionDate, setCurrentNutritionDate] = useState(() =>
    formatNutritionDayDate(new Date(), normalizedRolloverTime),
  );

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const refreshAndSchedule = () => {
      const now = new Date();
      setCurrentNutritionDate(formatNutritionDayDate(now, normalizedRolloverTime));

      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(
        refreshAndSchedule,
        getMillisecondsUntilNextNutritionDayRollover(now, normalizedRolloverTime),
      );
    };

    refreshAndSchedule();

    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        refreshAndSchedule();
      }
    });

    return () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      appStateSubscription.remove();
    };
  }, [normalizedRolloverTime]);

  return currentNutritionDate;
};
