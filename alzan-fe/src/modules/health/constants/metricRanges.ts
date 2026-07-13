import { MaleOrFemale } from '../../../types/requests.types';
import { BMI_RANGES, RangeCategory, getBodyFatRanges, getMuscleRanges } from './bodyCompositionRanges';

export interface MetricSegment {
  label: string;
  min: number | null;
  max: number | null;
  color: string;
}

export interface MetricRangeConfig {
  key: string;
  title: string;
  subtitle?: string;
  unit: string;
  appliesTo: 'all' | 'sex_and_age';
  paletteNote?: string;
}

export const METRIC_RANGES: MetricRangeConfig[] = [
  { key: 'bmi', title: 'IMC', unit: '', appliesTo: 'all' },
  {
    key: 'body_fat_pct',
    title: 'Grasa Corporal',
    unit: '%',
    appliesTo: 'sex_and_age',
    paletteNote: 'Normal is the reference range; very low values may also be undesirable.',
  },
  {
    key: 'skeletal_muscle_pct',
    title: 'Masa Muscular',
    subtitle: 'Músculo esquelético',
    unit: '%',
    appliesTo: 'sex_and_age',
    paletteNote: 'Higher skeletal-muscle ranges use blue and purple; low ranges use red.',
  },
];

const toMetricSegments = (ranges: RangeCategory[]): MetricSegment[] =>
  ranges.map(range => ({
    label: range.labelEs,
    min: range.min === 0 ? null : range.min,
    max: range.max >= 60 ? null : range.max,
    color: range.color,
  }));

export const getSegmentsForMetric = (metricKey: string, sex: MaleOrFemale, age: number): MetricSegment[] | null => {
  if (metricKey === 'bmi') return toMetricSegments(BMI_RANGES);
  const isFemale = sex === 'female';
  if (metricKey === 'body_fat_pct') return toMetricSegments(getBodyFatRanges(age, isFemale));
  if (metricKey === 'skeletal_muscle_pct') return toMetricSegments(getMuscleRanges(age, isFemale));
  return null;
};
