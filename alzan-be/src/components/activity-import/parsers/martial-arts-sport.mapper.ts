import { CanonicalActivitySportMapping } from './activity-import-canonical.types';

const normalizeSportText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export function mapMartialArtsTextToCanonical(raw: string | null | undefined): CanonicalActivitySportMapping | null {
  const text = normalizeSportText(raw);
  if (!text) return null;

  if (text.includes('kickboxing') || text.includes('kick_boxing')) {
    return { sportType: 'martial_arts', sportSubtype: 'kickboxing' };
  }
  if (text.includes('muay_thai')) return { sportType: 'martial_arts', sportSubtype: 'muay_thai' };
  if (text.includes('krav_maga')) return { sportType: 'martial_arts', sportSubtype: 'krav_maga' };
  if (
    text.includes('jiu_jitsu') ||
    text.includes('jiujitsu') ||
    text.includes('bjj') ||
    text.includes('brazilian_jiu_jitsu')
  ) {
    return { sportType: 'martial_arts', sportSubtype: 'jiu_jitsu_bjj' };
  }
  if (text.includes('taekwondo') || text.includes('tae_kwon_do')) {
    return { sportType: 'martial_arts', sportSubtype: 'taekwondo' };
  }
  if (text.includes('karate')) return { sportType: 'martial_arts', sportSubtype: 'karate' };
  if (text.includes('judo')) return { sportType: 'martial_arts', sportSubtype: 'judo' };
  if (text.includes('mma') || text.includes('mixed_martial_arts')) {
    return { sportType: 'martial_arts', sportSubtype: 'mma' };
  }
  if (text.includes('boxing') || text.includes('boxeo')) {
    return { sportType: 'martial_arts', sportSubtype: 'boxing' };
  }
  if (text.includes('martial_arts') || text.includes('combat_sport')) {
    return { sportType: 'martial_arts', sportSubtype: null };
  }

  return null;
}
