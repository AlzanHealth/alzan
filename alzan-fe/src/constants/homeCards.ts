import { CheckCircle, Flame, Footprints, LucideIcon, Moon, Scale } from 'lucide-react-native';
import { TranslationKey } from '../i18n/locales/en';

export type HomeCardKey = 'weight' | 'sleep' | 'kcal' | 'steps' | 'workouts';

export interface HomeCardDefinition {
  key: HomeCardKey;
  /** i18n key for the card label. */
  labelKey: TranslationKey;
  icon: LucideIcon;
}

/** Number of summary cards shown on the Home screen. */
export const HOME_CARDS_COUNT = 4;

/** All cards available to display on Home. Order = display order in settings. */
export const HOME_CARD_DEFINITIONS: HomeCardDefinition[] = [
  { key: 'weight', labelKey: 'settings.weight', icon: Scale },
  { key: 'sleep', labelKey: 'settings.sleep', icon: Moon },
  { key: 'kcal', labelKey: 'home.kcal', icon: Flame },
  { key: 'steps', labelKey: 'home.steps', icon: Footprints },
  { key: 'workouts', labelKey: 'home.workouts', icon: CheckCircle },
];

/** Default selection when the user has not customised their Home cards. */
export const DEFAULT_HOME_CARDS: HomeCardKey[] = ['weight', 'sleep', 'kcal', 'steps'];

const VALID_KEYS = new Set<HomeCardKey>(HOME_CARD_DEFINITIONS.map(d => d.key));

const isHomeCardKey = (value: string): value is HomeCardKey => VALID_KEYS.has(value as HomeCardKey);

/**
 * Normalise a stored selection into exactly HOME_CARDS_COUNT valid, unique keys,
 * padding from the defaults when invalid or incomplete.
 */
export const normalizeHomeCards = (stored?: string[] | null): HomeCardKey[] => {
  const result: HomeCardKey[] = [];
  for (const key of stored ?? []) {
    if (isHomeCardKey(key) && !result.includes(key)) {
      result.push(key);
    }
  }
  for (const key of DEFAULT_HOME_CARDS) {
    if (result.length >= HOME_CARDS_COUNT) break;
    if (!result.includes(key)) result.push(key);
  }
  return result.slice(0, HOME_CARDS_COUNT);
};
