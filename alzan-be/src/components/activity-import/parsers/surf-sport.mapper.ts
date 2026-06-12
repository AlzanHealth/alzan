import { CanonicalActivitySportMapping } from './activity-import-canonical.types';

const SURF_SPORT_TYPE = 'surf' as CanonicalActivitySportMapping['sportType'];

const normalizeSportText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export function mapSurfTextToCanonical(raw: string | null | undefined): CanonicalActivitySportMapping | null {
  const text = normalizeSportText(raw);
  if (!text) return null;

  // Wind/kite/wake variants are different disciplines; keep them out of surf.
  if (text.includes('windsurf') || text.includes('kitesurf') || text.includes('wakesurf')) {
    return null;
  }

  if (
    text.includes('paddle_surf') ||
    text.includes('stand_up_paddle') ||
    text.includes('paddleboard') ||
    text.includes('paddle_board')
  ) {
    return { sportType: SURF_SPORT_TYPE, sportSubtype: 'paddle_surf' };
  }
  if (text.includes('bodyboard')) {
    return { sportType: SURF_SPORT_TYPE, sportSubtype: 'bodyboard' };
  }

  const tokens = text.split('_');
  if (tokens.includes('surfing') || tokens.includes('surf')) {
    return { sportType: SURF_SPORT_TYPE, sportSubtype: 'surf' };
  }

  return null;
}
