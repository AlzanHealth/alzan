export type HomeCardKey = 'weight' | 'sleep' | 'kcal' | 'steps' | 'workouts';
export type HomeMode = 'compact' | 'detailed';
export type HomePrimaryAction = 'smart_workout' | 'add_meal' | 'log_weight' | 'open_nutrition';
export type HomePdfSectionKey = 'health' | 'training' | 'nutrition';

export const HOME_CARDS_COUNT = 4;
export const DEFAULT_HOME_CARDS_ORDER: HomeCardKey[] = ['weight', 'sleep', 'kcal', 'steps'];
export const DEFAULT_HOME_MODE: HomeMode = 'detailed';
export const DEFAULT_HOME_PRIMARY_ACTION: HomePrimaryAction = 'smart_workout';
export const DEFAULT_HOME_PDF_SECTION_ORDER: HomePdfSectionKey[] = ['health', 'training', 'nutrition'];

const VALID_HOME_CARD_KEYS: readonly HomeCardKey[] = ['weight', 'sleep', 'kcal', 'steps', 'workouts'];
const VALID_HOME_MODES: readonly HomeMode[] = ['compact', 'detailed'];
const VALID_HOME_PRIMARY_ACTIONS: readonly HomePrimaryAction[] = [
  'smart_workout',
  'add_meal',
  'log_weight',
  'open_nutrition',
];
const VALID_HOME_PDF_SECTION_KEYS: readonly HomePdfSectionKey[] = ['health', 'training', 'nutrition'];

const isHomeCardKey = (value: string): value is HomeCardKey => VALID_HOME_CARD_KEYS.includes(value as HomeCardKey);

const isHomeMode = (value: string): value is HomeMode => VALID_HOME_MODES.includes(value as HomeMode);

const isHomePrimaryAction = (value: string): value is HomePrimaryAction =>
  VALID_HOME_PRIMARY_ACTIONS.includes(value as HomePrimaryAction);

const isHomePdfSectionKey = (value: string): value is HomePdfSectionKey =>
  VALID_HOME_PDF_SECTION_KEYS.includes(value as HomePdfSectionKey);

export const normalizeHomeCardOrder = (stored?: string[] | null): HomeCardKey[] => {
  const result: HomeCardKey[] = [];
  for (const key of stored ?? []) {
    if (isHomeCardKey(key) && !result.includes(key)) {
      result.push(key);
    }
  }
  for (const key of DEFAULT_HOME_CARDS_ORDER) {
    if (result.length >= HOME_CARDS_COUNT) break;
    if (!result.includes(key)) result.push(key);
  }
  return result.slice(0, HOME_CARDS_COUNT);
};

export const normalizeHomeMode = (value?: string | null): HomeMode =>
  value && isHomeMode(value) ? value : DEFAULT_HOME_MODE;

export const normalizeHomePrimaryAction = (value?: string | null): HomePrimaryAction =>
  value && isHomePrimaryAction(value) ? value : DEFAULT_HOME_PRIMARY_ACTION;

export const normalizeHomePdfSectionOrder = (stored?: string[] | null): HomePdfSectionKey[] => {
  const result: HomePdfSectionKey[] = [];
  for (const key of stored ?? []) {
    if (isHomePdfSectionKey(key) && !result.includes(key)) {
      result.push(key);
    }
  }
  for (const key of DEFAULT_HOME_PDF_SECTION_ORDER) {
    if (!result.includes(key)) result.push(key);
  }
  return result.slice(0, DEFAULT_HOME_PDF_SECTION_ORDER.length);
};
