import { useCallback, useMemo } from 'react';
import { usePreferencesContext } from '../../context/PreferencesContext';
import { AppearanceSettingsJson } from '../../types/requests.types';
import { HomeCardKey, normalizeHomeCards } from '../../constants/homeCards';

const DEFAULT_APPEARANCE: AppearanceSettingsJson = {
  theme: 'system',
  accessibility: { reduceMotion: false, largeText: false },
};

/**
 * Reads and persists which summary cards appear on the Home screen.
 * Stored inside `appearance_settings.home_cards` so it syncs across devices.
 */
export const useHomeCards = () => {
  const { preferences, updatePreferences, updating } = usePreferencesContext();

  const homeCards = useMemo(
    () => normalizeHomeCards(preferences?.appearance_settings?.home_cards),
    [preferences?.appearance_settings?.home_cards],
  );

  const setHomeCards = useCallback(
    (next: HomeCardKey[]) => {
      const base = preferences?.appearance_settings ?? DEFAULT_APPEARANCE;
      return updatePreferences({
        appearance_settings: { ...base, home_cards: normalizeHomeCards(next) },
      });
    },
    [preferences?.appearance_settings, updatePreferences],
  );

  return { homeCards, setHomeCards, updating };
};
