import { CanonicalActivitySportMapping } from './activity-import-canonical.types';

const normalizeSportText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export function mapClimbingTextToCanonical(raw: string | null | undefined): CanonicalActivitySportMapping | null {
  const text = normalizeSportText(raw);
  if (!text) return null;

  if (text.includes('bouldering') || text.includes('boulder')) {
    return { sportType: 'climbing', sportSubtype: 'bouldering' };
  }
  if (text.includes('deep_water_soloing') || text.includes('psicobloc')) {
    return { sportType: 'climbing', sportSubtype: 'deep_water_soloing' };
  }
  if (text.includes('trad_climbing') || text.includes('traditional_climbing') || text.includes('escalada_clasica')) {
    return { sportType: 'climbing', sportSubtype: 'trad_climbing' };
  }
  if (text.includes('indoor_climbing') || text.includes('climbing_gym') || text.includes('rocodromo')) {
    return { sportType: 'climbing', sportSubtype: 'indoor_climbing' };
  }
  if (text.includes('sport_climbing') || text.includes('rock_climbing') || text.includes('escalada_deportiva')) {
    return { sportType: 'climbing', sportSubtype: 'sport_climbing' };
  }
  if (text.includes('climbing') || text.includes('escalada')) {
    return { sportType: 'climbing', sportSubtype: null };
  }

  return null;
}
