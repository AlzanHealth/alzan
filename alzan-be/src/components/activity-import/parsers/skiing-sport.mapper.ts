import { CanonicalActivitySportMapping } from './activity-import-canonical.types';

const SKIING_SPORT_TYPE = 'skiing' as CanonicalActivitySportMapping['sportType'];

const normalizeSportText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export function mapSkiingTextToCanonical(raw: string | null | undefined): CanonicalActivitySportMapping | null {
  const text = normalizeSportText(raw);
  if (!text) return null;

  if (text.includes('snowboard') || text.includes('splitboard')) {
    return null;
  }
  // Nordic walking is walking; kite variants are not skiing.
  if (text.includes('nordic_walking') || text.includes('kite')) {
    return null;
  }

  if (text.includes('alpine') || text.includes('downhill') || text.includes('alpino') || text.includes('pista')) {
    return { sportType: SKIING_SPORT_TYPE, sportSubtype: 'alpine' };
  }
  if (text.includes('cross_country') || text.includes('nordic') || text.includes('fondo') || text.includes('xc_ski')) {
    return { sportType: SKIING_SPORT_TYPE, sportSubtype: 'cross_country' };
  }
  if (
    text.includes('backcountry') ||
    text.includes('touring') ||
    text.includes('travesia') ||
    text.includes('randonee') ||
    text.includes('randonnee')
  ) {
    return { sportType: SKIING_SPORT_TYPE, sportSubtype: 'backcountry' };
  }
  if (text.includes('freeride') || text.includes('fuera_pista') || text.includes('fuera_de_pista')) {
    return { sportType: SKIING_SPORT_TYPE, sportSubtype: 'freeride' };
  }
  if (text.includes('skiing') || text.includes('esqui') || text.includes('ski')) {
    return { sportType: SKIING_SPORT_TYPE, sportSubtype: null };
  }

  return null;
}
