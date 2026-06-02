import { CanonicalActivitySportMapping } from './activity-import-canonical.types';

const GOLF_SPORT_TYPE = 'golf' as CanonicalActivitySportMapping['sportType'];

const normalizeSportText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export function mapGolfTextToCanonical(raw: string | null | undefined): CanonicalActivitySportMapping | null {
  const text = normalizeSportText(raw);
  if (!text) return null;

  if (text.includes('pitch_and_putt') || text.includes('pitch_putt')) {
    return { sportType: GOLF_SPORT_TYPE, sportSubtype: 'pitch_and_putt' };
  }
  if (text.includes('driving_range') || text.includes('campo_de_practicas') || text.includes('practice_range')) {
    return { sportType: GOLF_SPORT_TYPE, sportSubtype: 'driving_range' };
  }
  if (text.includes('18_holes') || text.includes('18_hoyos') || text.includes('eighteen_holes')) {
    return { sportType: GOLF_SPORT_TYPE, sportSubtype: 'round_18_holes' };
  }
  if (text.includes('9_holes') || text.includes('9_hoyos') || text.includes('nine_holes')) {
    return { sportType: GOLF_SPORT_TYPE, sportSubtype: 'round_9_holes' };
  }
  if (text.includes('round_of_golf') || text.includes('ronda_de_golf')) {
    return { sportType: GOLF_SPORT_TYPE, sportSubtype: null };
  }
  if (text === 'golf' || text === 'golfing' || text.includes('golf_') || text.includes('_golf')) {
    return { sportType: GOLF_SPORT_TYPE, sportSubtype: null };
  }

  return null;
}
