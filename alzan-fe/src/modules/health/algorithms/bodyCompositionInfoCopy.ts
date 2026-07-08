import { BodyFatMethod, MuscleMethod } from './bodyComposition';
import { MaleOrFemale } from '../../../types/requests.types';

type Translate = (key: string, values?: Record<string, string | number>) => string;

type CompositionMetric = 'bodyFat' | 'muscle';

interface LocalizedFormulaInput {
  metric: CompositionMetric;
  method: BodyFatMethod | MuscleMethod;
  sex: MaleOrFemale;
  t: Translate;
}

interface PrecisionTip {
  title: string;
  body: string;
}

interface RemainderInfoCopy {
  title: string;
  description: string;
  formula: string;
  components: string;
  note: string;
}

export const getLocalizedCompositionFormula = ({ metric, method, sex, t }: LocalizedFormulaInput): string => {
  const femaleFactor = sex === 'female' ? 1 : 0;
  const maleFactor = sex === 'male' ? 1 : 0;

  if (metric === 'bodyFat') {
    switch (method) {
      case 'cun_bae':
        return t('health.formulaCunBaeLocalized', { femaleFactor });
      case 'rfm':
        return sex === 'female' ? t('health.formulaRfmFemaleLocalized') : t('health.formulaRfmMaleLocalized');
      case 'bai':
        return t('health.formulaBaiLocalized');
      case 'deurenberg':
        return t('health.formulaDeurenbergLocalized', { maleFactor });
      default:
        return '';
    }
  }

  switch (method) {
    case 'lee_et_al':
      return t('health.formulaLeeLocalized', { maleFactor });
    case 'al_gindan':
      return sex === 'female' ? t('health.formulaAlGindanFemaleLocalized') : t('health.formulaAlGindanMaleLocalized');
    default:
      return '';
  }
};

export const getBodyFatPrecisionTip = (method: BodyFatMethod, t: Translate): PrecisionTip => {
  if (method === 'rfm') {
    return {
      title: t('health.bodyFatOptimalPrecisionTitle'),
      body: t('health.bodyFatOptimalPrecisionBody'),
    };
  }

  return {
    title: t('health.improvePrecision'),
    body: t('health.bodyFatImprovePrecisionBody'),
  };
};

export const getMusclePrecisionTip = (method: MuscleMethod, t: Translate): PrecisionTip => {
  if (method === 'al_gindan') {
    return {
      title: t('health.muscleOptimalPrecisionTitle'),
      body: t('health.muscleOptimalPrecisionBody'),
    };
  }

  return {
    title: t('health.improvePrecision'),
    body: t('health.muscleImprovePrecisionBody'),
  };
};

export const getRemainderInfoCopy = (t: Translate): RemainderInfoCopy => ({
  title: t('health.remainder'),
  description: t('health.remainderDescription'),
  formula: t('health.remainderFormula'),
  components: t('health.remainderComponents'),
  note: t('health.remainderClinicalNote'),
});
