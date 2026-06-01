import { CanonicalActivitySportMapping } from './activity-import-canonical.types';

const SNOWBOARD_SPORT_TYPE = 'snowboard' as CanonicalActivitySportMapping['sportType'];

const normalizeSportText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export function mapSnowboardTextToCanonical(raw: string | null | undefined): CanonicalActivitySportMapping | null {
  const text = normalizeSportText(raw);
  if (!text) return null;

  if (text.includes('skiing') || text.includes('esqui') || text.includes('ski')) {
    return null;
  }

  if (text.includes('splitboard')) {
    return { sportType: SNOWBOARD_SPORT_TYPE, sportSubtype: 'splitboard' };
  }
  if (
    text.includes('freeride') ||
    text.includes('fuera_pista') ||
    text.includes('fuera_de_pista') ||
    text.includes('backcountry')
  ) {
    return { sportType: SNOWBOARD_SPORT_TYPE, sportSubtype: 'freeride' };
  }
  if (text.includes('park') || text.includes('freestyle') || text.includes('jibbing')) {
    return { sportType: SNOWBOARD_SPORT_TYPE, sportSubtype: 'park_freestyle' };
  }
  if (text.includes('pista') || text.includes('carving') || text.includes('alpine') || text.includes('alpino')) {
    return { sportType: SNOWBOARD_SPORT_TYPE, sportSubtype: 'slope' };
  }
  if (text.includes('snowboard') || text.includes('snowboarding')) {
    return { sportType: SNOWBOARD_SPORT_TYPE, sportSubtype: null };
  }

  return null;
}
