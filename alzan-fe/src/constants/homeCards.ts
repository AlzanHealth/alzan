import { CheckCircle, Flame, Footprints, LucideIcon, Moon, Scale } from 'lucide-react-native';
import { TranslationKey } from '../i18n/locales/en';
import { DEFAULT_HOME_CARDS_ORDER, HOME_CARDS_COUNT, HomeCardKey, normalizeHomeCardOrder } from './homeSettings';

export { HOME_CARDS_COUNT };
export type { HomeCardKey };

export interface HomeCardDefinition {
  key: HomeCardKey;
  /** i18n key for the card label. */
  labelKey: TranslationKey;
  icon: LucideIcon;
}

/** All cards available to display on Home. Order = display order in settings. */
export const HOME_CARD_DEFINITIONS: HomeCardDefinition[] = [
  { key: 'weight', labelKey: 'settings.weight', icon: Scale },
  { key: 'sleep', labelKey: 'settings.sleep', icon: Moon },
  { key: 'kcal', labelKey: 'home.kcal', icon: Flame },
  { key: 'steps', labelKey: 'home.steps', icon: Footprints },
  { key: 'workouts', labelKey: 'home.workouts', icon: CheckCircle },
];

/** Default selection when the user has not customised their Home cards. */
export const DEFAULT_HOME_CARDS: HomeCardKey[] = DEFAULT_HOME_CARDS_ORDER;

/**
 * Normalise a stored selection into exactly HOME_CARDS_COUNT valid, unique keys,
 * padding from the defaults when invalid or incomplete.
 */
export const normalizeHomeCards = (stored?: string[] | null): HomeCardKey[] => {
  return normalizeHomeCardOrder(stored);
};
