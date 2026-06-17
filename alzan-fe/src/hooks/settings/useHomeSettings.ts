import { useCallback, useMemo } from 'react';
import { usePreferencesContext } from '../../context/PreferencesContext';
import { AppearanceSettingsJson } from '../../types/requests.types';
import {
  DEFAULT_HOME_CARDS_ORDER,
  DEFAULT_HOME_MODE,
  DEFAULT_HOME_PDF_SECTION_ORDER,
  DEFAULT_HOME_PRIMARY_ACTION,
  HomeMode,
  HomePdfSectionKey,
  HomePrimaryAction,
  normalizeHomeMode,
  normalizeHomePdfSectionOrder,
  normalizeHomePrimaryAction,
} from '../../constants/homeSettings';

const DEFAULT_APPEARANCE: AppearanceSettingsJson = {
  theme: 'system',
  accessibility: { reduceMotion: false, largeText: false },
  home_cards: DEFAULT_HOME_CARDS_ORDER,
  home_mode: DEFAULT_HOME_MODE,
  home_primary_action: DEFAULT_HOME_PRIMARY_ACTION,
  home_pdf_section_order: DEFAULT_HOME_PDF_SECTION_ORDER,
};

export const useHomeSettings = () => {
  const { preferences, updatePreferences, updating } = usePreferencesContext();
  const appearance = preferences?.appearance_settings;

  const homeMode = useMemo(() => normalizeHomeMode(appearance?.home_mode), [appearance?.home_mode]);
  const homePrimaryAction = useMemo(
    () => normalizeHomePrimaryAction(appearance?.home_primary_action),
    [appearance?.home_primary_action],
  );
  const homePdfSectionOrder = useMemo(
    () => normalizeHomePdfSectionOrder(appearance?.home_pdf_section_order),
    [appearance?.home_pdf_section_order],
  );

  const updateAppearance = useCallback(
    (updates: Partial<AppearanceSettingsJson>) => {
      const base = preferences?.appearance_settings ?? DEFAULT_APPEARANCE;
      return updatePreferences({
        appearance_settings: { ...base, ...updates },
      });
    },
    [preferences?.appearance_settings, updatePreferences],
  );

  const setHomeMode = useCallback(
    (next: HomeMode) => updateAppearance({ home_mode: normalizeHomeMode(next) }),
    [updateAppearance],
  );

  const setHomePrimaryAction = useCallback(
    (next: HomePrimaryAction) => updateAppearance({ home_primary_action: normalizeHomePrimaryAction(next) }),
    [updateAppearance],
  );

  const setHomePdfSectionOrder = useCallback(
    (next: HomePdfSectionKey[]) => updateAppearance({ home_pdf_section_order: normalizeHomePdfSectionOrder(next) }),
    [updateAppearance],
  );

  return {
    homeMode,
    homePrimaryAction,
    homePdfSectionOrder,
    setHomeMode,
    setHomePrimaryAction,
    setHomePdfSectionOrder,
    updating,
  };
};
