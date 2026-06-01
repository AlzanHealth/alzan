import { CanonicalActivitySportMapping } from './activity-import-canonical.types';

const TRAIL_SPORT_TYPE: CanonicalActivitySportMapping['sportType'] = 'trail';

const normalizeSportText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export function mapTrailTextToCanonical(raw: string | null | undefined): CanonicalActivitySportMapping | null {
  const text = normalizeSportText(raw);
  if (!text) return null;

  if (text.includes('ultra_trail') || text.includes('ultratrail')) {
    return { sportType: TRAIL_SPORT_TYPE, sportSubtype: 'ultra_trail' };
  }
  if (text.includes('fast_hiking') || text.includes('speed_hiking') || text.includes('senderismo_rapido')) {
    return { sportType: TRAIL_SPORT_TYPE, sportSubtype: 'fast_hiking' };
  }
  if (text.includes('mountain_running') || text.includes('carrera_de_montana')) {
    return { sportType: TRAIL_SPORT_TYPE, sportSubtype: 'mountain_running' };
  }
  if (text.includes('trail_running') || text.includes('trail_run') || text.includes('trailrun')) {
    return { sportType: TRAIL_SPORT_TYPE, sportSubtype: 'trail_running' };
  }
  if (text.includes('trail') && (text.includes('run') || text.includes('running') || text.includes('carrera'))) {
    return { sportType: TRAIL_SPORT_TYPE, sportSubtype: 'trail_running' };
  }

  return null;
}
