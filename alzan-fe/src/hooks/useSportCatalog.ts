import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { Row, SportType } from '../types/requests.types';
import { TranslationKey } from '../i18n/locales/en';

export type SportCatalogOptionType =
  | 'goal'
  | 'modality'
  | 'terrain'
  | 'pool_type'
  | 'stroke'
  | 'boots'
  | 'base_load'
  | 'racket'
  | 'contact_level'
  | 'wetsuit'
  | 'board'
  | 'climbing_grade'
  | 'ski_type'
  | 'slope_type'
  | 'snowboard_type'
  | 'golf_club_focus'
  | 'hyrox_station_focus';
type SportCatalogLocalizedLabels = {
  label_es?: string | null;
  label_en?: string | null;
  group_label_es?: string | null;
  group_label_en?: string | null;
};

export type SportCatalogOption = Row<'sport_catalog_options'> & SportCatalogLocalizedLabels;

type OptionsBySport = Partial<Record<SportType, Partial<Record<SportCatalogOptionType, SportCatalogOption[]>>>>;

const OPTION_TYPES: SportCatalogOptionType[] = [
  'goal',
  'modality',
  'terrain',
  'pool_type',
  'stroke',
  'boots',
  'base_load',
  'racket',
  'contact_level',
  'wetsuit',
  'board',
  'climbing_grade',
  'ski_type',
  'slope_type',
  'snowboard_type',
  'golf_club_focus',
  'hyrox_station_focus',
];

const isSportCatalogOptionType = (value: string): value is SportCatalogOptionType =>
  OPTION_TYPES.includes(value as SportCatalogOptionType);

const normalizeSportType = (sportType: string | null | undefined): SportType | null => {
  if (!sportType) return null;
  return sportType === 'gym' ? 'strength' : (sportType as SportType);
};

const LEGACY_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  'cycling:trail': 'training.sportOptionMtb',
  'cycling:indoor': 'training.sportOptionIndoorTrainer',
  'running:road': 'training.sportOptionOutdoor',
  'running:aire_libre': 'training.sportOptionOutdoor',
  'running:indoor': 'training.sportOptionTreadmill',
  'running:cinta': 'training.sportOptionTreadmill',
  'running:track': 'training.sportOptionTrack',
  'running:trail': 'training.sportOptionTrail',
  'running:race': 'training.sportOptionRace',
  'running:walk': 'training.sportOptionUrbanWalk',
  'hiking:trail': 'training.sportOptionTrail',
  'padel:indoor': 'training.sportOptionIndoorCourt',
  'padel:outdoor': 'training.sportOptionOutdoorCourt',
  'tennis:indoor': 'training.sportOptionIndoorCourt',
  'tennis:outdoor': 'training.sportOptionOutdoorCourt',
  'football:indoor': 'training.sportOptionIndoorCourt',
  'football:outdoor': 'training.sportOptionOutdoor',
  'basketball:indoor': 'training.sportOptionIndoorCourt',
  'strength:indoor': 'training.sportOptionGym',
  'gym:indoor': 'training.sportOptionGym',
};

const formatUnknownOption = (optionKey: string): string =>
  optionKey
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const asTranslationKey = (key: string): TranslationKey => key as TranslationKey;

export const useSportCatalog = () => {
  const { i18n, t } = useTranslation();
  const languageCode = i18n.language?.startsWith('es') ? 'es' : 'en';

  const { data: options = [], isLoading } = useQuery({
    queryKey: ['sportCatalogOptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sport_catalog_options')
        .select(
          'id,sport_type,option_type,option_key,translation_key,group_translation_key,label_es,label_en,group_label_es,group_label_en,sort_order,is_template_selectable,is_active,created_at',
        )
        .eq('is_active', true)
        .order('sport_type', { ascending: true })
        .order('option_type', { ascending: true })
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data as unknown as SportCatalogOption[]).filter(option => isSportCatalogOptionType(option.option_type));
    },
  });

  const groupedOptions = useMemo<OptionsBySport>(() => {
    return options.reduce<OptionsBySport>((acc, option) => {
      const optionType = option.option_type;
      if (!isSportCatalogOptionType(optionType)) return acc;

      const sportType = option.sport_type;
      acc[sportType] ??= {};
      acc[sportType][optionType] ??= [];
      acc[sportType][optionType]?.push(option);
      return acc;
    }, {});
  }, [options]);

  const getOptions = (
    sportType: string | null | undefined,
    optionType: SportCatalogOptionType,
    templateSelectableOnly = true,
  ): SportCatalogOption[] => {
    const normalizedSportType = normalizeSportType(sportType);
    if (!normalizedSportType) return [];

    const sportOptions = groupedOptions[normalizedSportType]?.[optionType] ?? [];
    if (!templateSelectableOnly) return sportOptions;
    return sportOptions.filter(option => option.is_template_selectable);
  };

  const getGroupLabel = (sportType: string | null | undefined, optionType: SportCatalogOptionType): string => {
    const option = getOptions(sportType, optionType, false)[0];
    if (!option) return '';

    const localizedLabel = languageCode === 'es' ? option.group_label_es : option.group_label_en;
    return localizedLabel || t(asTranslationKey(option.group_translation_key));
  };

  const getLocalizedOptionLabel = (option: SportCatalogOption): string => {
    if (languageCode === 'es' && option.sport_type === 'hyrox' && option.option_type === 'hyrox_station_focus') {
      const translatedLabel = t(asTranslationKey(option.translation_key));
      if (translatedLabel && translatedLabel !== option.translation_key) return translatedLabel;
    }

    const localizedLabel = languageCode === 'es' ? option.label_es : option.label_en;
    return localizedLabel || t(asTranslationKey(option.translation_key));
  };

  const getOptionLabel = (
    sportType: string | null | undefined,
    optionKey: string | null | undefined,
    optionType?: SportCatalogOptionType,
  ): string => {
    if (!optionKey) return '';

    const optionTypes = optionType ? [optionType] : OPTION_TYPES;
    const match = optionTypes
      .flatMap(type => getOptions(sportType, type, false))
      .find(option => option.option_key === optionKey);

    if (match) return getLocalizedOptionLabel(match);

    const normalizedSportType = normalizeSportType(sportType);
    const legacyKey = `${normalizedSportType ?? sportType}:${optionKey}`;
    const legacyTranslationKey = LEGACY_TRANSLATION_KEYS[legacyKey];
    if (legacyTranslationKey) return t(legacyTranslationKey);

    return formatUnknownOption(optionKey);
  };

  return {
    options,
    groupedOptions,
    isLoading,
    getOptions,
    getGroupLabel,
    getOptionLabel,
  };
};
