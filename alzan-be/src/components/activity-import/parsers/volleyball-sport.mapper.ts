import { CanonicalActivitySportMapping } from './activity-import-canonical.types';

const VOLLEYBALL_SPORT_TYPE = 'volleyball' as CanonicalActivitySportMapping['sportType'];

const normalizeSportText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export function mapVolleyballTextToCanonical(raw: string | null | undefined): CanonicalActivitySportMapping | null {
  const text = normalizeSportText(raw);
  if (!text) return null;

  if (text.includes('beach_volleyball') || text.includes('voley_playa') || text.includes('volley_playa')) {
    return { sportType: VOLLEYBALL_SPORT_TYPE, sportSubtype: 'beach_volleyball' };
  }
  if (text.includes('indoor_volleyball') || text.includes('voleibol_indoor') || text.includes('volleyball_indoor')) {
    return { sportType: VOLLEYBALL_SPORT_TYPE, sportSubtype: 'indoor_volleyball' };
  }
  if (text.includes('volleyball') || text.includes('voleibol') || text.includes('volley') || text.includes('voley')) {
    return { sportType: VOLLEYBALL_SPORT_TYPE, sportSubtype: null };
  }

  return null;
}
