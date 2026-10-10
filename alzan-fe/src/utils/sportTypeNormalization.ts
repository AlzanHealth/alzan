import type { SportType } from '../types/requests.types';

const SPORT_TYPES = [
  'basketball',
  'padel',
  'hiking',
  'strength',
  'running',
  'cycling',
  'swimming',
  'football',
  'tennis',
  'other',
  'gym',
  'martial_arts',
  'climbing',
  'surf',
  'volleyball',
  'trail',
  'skiing',
  'snowboard',
  'golf',
  'hyrox',
] as const satisfies readonly SportType[];

const SPORT_TYPE_SET: ReadonlySet<string> = new Set(SPORT_TYPES);

const SPORT_TYPE_ALIASES: Readonly<Record<string, SportType>> = {
  run: 'running',
  run_outdoor: 'running',
  running_outdoor: 'running',
  outdoor_running: 'running',
  road_running: 'running',
  cycle: 'cycling',
  bike: 'cycling',
  biking: 'cycling',
  cycling_outdoor: 'cycling',
  outdoor_cycling: 'cycling',
  cycling_indoor: 'cycling',
  indoor_cycling: 'cycling',
  indoor_trainer: 'cycling',
  swim: 'swimming',
  swimming_pool: 'swimming',
  pool_swimming: 'swimming',
  soccer: 'football',
  association_football: 'football',
  gym: 'strength',
  strength_training: 'strength',
  weight_training: 'strength',
  weightlifting: 'strength',
  indoor_strength: 'strength',
  trail_running: 'trail',
  trekking: 'hiking',
  hike: 'hiking',
  walking: 'hiking',
  martial_art: 'martial_arts',
};

const normalizeToken = (value: string | null | undefined): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const inferOtherSport = (subtype: string): SportType | null => {
  if (/walk|hike|trek/.test(subtype)) return 'hiking';
  if (/trail.?run/.test(subtype)) return 'trail';
  if (/run|jog/.test(subtype)) return 'running';
  if (/cycl|bike|bicycl/.test(subtype)) return 'cycling';
  if (/swim/.test(subtype)) return 'swimming';
  return null;
};

/** Normalizes legacy/provider sport identifiers for frontend grouping without changing persisted values. */
export const normalizeSportType = (
  sportType: string | null | undefined,
  sportSubtype?: string | null,
): SportType | null => {
  const token = normalizeToken(sportType);
  const normalized = SPORT_TYPE_ALIASES[token] ?? (SPORT_TYPE_SET.has(token) ? (token as SportType) : null);
  if (normalized === 'other') return inferOtherSport(normalizeToken(sportSubtype)) ?? 'other';
  return normalized;
};
