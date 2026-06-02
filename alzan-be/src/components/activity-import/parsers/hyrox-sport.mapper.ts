import { CanonicalActivitySportMapping } from './activity-import-canonical.types';

const HYROX_SPORT_TYPE = 'hyrox' as CanonicalActivitySportMapping['sportType'];

const normalizeSportText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export function mapHyroxTextToCanonical(raw: string | null | undefined): CanonicalActivitySportMapping | null {
  const text = normalizeSportText(raw);
  if (!text) return null;

  const explicitHyrox =
    text === 'hyrox' ||
    text.includes('hyrox_race') ||
    text.includes('race_hyrox') ||
    text.includes('hyrox_training') ||
    text.includes('training_hyrox') ||
    text.includes('hyrox_workout') ||
    text.includes('workout_hyrox') ||
    text.includes('hyrox_simulation') ||
    text.includes('simulation_hyrox') ||
    text.includes('simulacion_hyrox') ||
    text.includes('hyrox_simulacion');

  if (explicitHyrox) {
    return { sportType: HYROX_SPORT_TYPE, sportSubtype: null };
  }

  return null;
}
