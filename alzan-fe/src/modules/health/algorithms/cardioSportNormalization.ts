import type { SportType } from '../../../types/requests.types';
import { normalizeSportType } from '../../../utils/sportTypeNormalization';

export type CardioSportActivity = {
  sport_type: string;
  sport_subtype: string | null;
  start_time: string;
};

export type CardioSportOption = {
  sportType: string;
  lastActivityTimestamp: number;
};

const DISPLAY_SPORT_ORDER: readonly SportType[] = [
  'running',
  'cycling',
  'swimming',
  'football',
  'basketball',
  'tennis',
  'padel',
  'hiking',
  'trail',
  'martial_arts',
  'climbing',
  'volleyball',
  'surf',
  'skiing',
  'snowboard',
  'golf',
  'strength',
  'hyrox',
  'other',
];

export const normalizeCardioSportType = (
  sportType: string | null | undefined,
  sportSubtype?: string | null,
): string => {
  const normalizedSport = normalizeSportType(sportType, sportSubtype);
  if (!normalizedSport) {
    const token = (sportType ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    return token || 'unknown';
  }
  const subtypeToken = (sportSubtype ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (normalizedSport === 'other' && subtypeToken && subtypeToken !== 'other') {
    const inferredSubtypeSport = normalizeSportType(sportSubtype);
    return inferredSubtypeSport && inferredSubtypeSport !== 'other' ? inferredSubtypeSport : `other_${subtypeToken}`;
  }
  if (normalizedSport === 'running' && /(^|_)trail(_|$)/.test(subtypeToken)) return 'trail';
  return normalizedSport === 'strength' ? 'gym' : normalizedSport;
};

export const normalizeCardioSportSubtype = (
  sportType: string | null | undefined,
  sportSubtype: string | null | undefined,
): string | null => {
  const normalizedSport = normalizeSportType(sportType, sportSubtype);
  const subtypeToken = (sportSubtype ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const typeToken = (sportType ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const typeEncodesSubtype = typeToken !== normalizedSport ? typeToken : '';
  const token = subtypeToken || typeEncodesSubtype;
  if (!normalizedSport) return subtypeToken || null;
  if (normalizedSport === 'trail' && (token === 'trail' || token === 'trail_running' || typeToken === 'trail'))
    return 'trail';
  if (token.length === 0) return null;

  if (normalizedSport === 'running') {
    if (['road', 'outdoor', 'road_running', 'running_outdoor'].includes(token)) return 'outdoor';
    if (['indoor', 'treadmill', 'indoor_running'].includes(token)) return 'indoor';
    if (['race', 'racing', 'competition'].includes(token)) return 'race';
  }
  if (normalizedSport === 'cycling') {
    if (['indoor', 'indoor_trainer', 'trainer', 'stationary', 'spin'].includes(token)) return 'indoor';
    if (['road', 'outdoor', 'road_cycling'].includes(token)) return 'outdoor';
    if (['trail', 'mtb', 'mountain_bike', 'mountain_biking'].includes(token)) return 'off_road';
  }
  if (normalizedSport === 'swimming') {
    if (['pool', 'indoor', 'pool_swimming'].includes(token)) return 'pool';
    if (['openwater', 'open_water', 'outdoor'].includes(token)) return 'open_water';
  }
  if (normalizedSport === 'strength' && ['gym', 'indoor', 'indoor_strength', 'strength_training'].includes(token))
    return 'gym';
  if (normalizedSport === 'football') {
    if (['football_7', '7_a_side', 'seven_a_side'].includes(token)) return 'football_7';
    if (['football_11', '11_a_side', 'eleven_a_side'].includes(token)) return 'football_11';
  }

  return token;
};

export const isSameCardioSportSubtype = (
  left: Pick<CardioSportActivity, 'sport_type' | 'sport_subtype'>,
  right: Pick<CardioSportActivity, 'sport_type' | 'sport_subtype'>,
): boolean => {
  if (
    normalizeCardioSportType(left.sport_type, left.sport_subtype) !==
    normalizeCardioSportType(right.sport_type, right.sport_subtype)
  ) {
    return false;
  }
  const leftSubtype = normalizeCardioSportSubtype(left.sport_type, left.sport_subtype);
  const rightSubtype = normalizeCardioSportSubtype(right.sport_type, right.sport_subtype);
  // Older/device-imported activities often omit subtype. Do not discard the
  // pair for that alone; the analysis reports the missing context and lowers
  // confidence. Two known, different modalities remain incomparable.
  return leftSubtype === null || rightSubtype === null || leftSubtype === rightSubtype;
};

export const getPracticedCardioSports = (activities: readonly CardioSportActivity[]): CardioSportOption[] => {
  const latestBySport = new Map<string, number>();
  for (const activity of activities) {
    const sportType = normalizeCardioSportType(activity.sport_type, activity.sport_subtype);
    const parsedDate = Date.parse(activity.start_time);
    const timestamp = Number.isFinite(parsedDate) ? parsedDate : 0;
    latestBySport.set(sportType, Math.max(latestBySport.get(sportType) ?? 0, timestamp));
  }

  return [...latestBySport.entries()]
    .map(([sportType, lastActivityTimestamp]) => ({ sportType, lastActivityTimestamp }))
    .sort((left, right) => {
      const recencyDifference = right.lastActivityTimestamp - left.lastActivityTimestamp;
      if (recencyDifference !== 0) return recencyDifference;
      const leftOrder = DISPLAY_SPORT_ORDER.findIndex(sport => sport === left.sportType);
      const rightOrder = DISPLAY_SPORT_ORDER.findIndex(sport => sport === right.sportType);
      return (
        (leftOrder === -1 ? DISPLAY_SPORT_ORDER.length : leftOrder) -
        (rightOrder === -1 ? DISPLAY_SPORT_ORDER.length : rightOrder)
      );
    });
};

export const filterCardioActivitiesBySport = <T extends CardioSportActivity>(
  activities: readonly T[],
  sportType: string,
): T[] =>
  activities.filter(activity => normalizeCardioSportType(activity.sport_type, activity.sport_subtype) === sportType);
