import { BodyMeasurement, MeasurementType } from '../../../types/requests.types';
import { TranslationKey } from '../../../i18n/locales/en';

export type MeasurementProtocol = 'waist_iliac_crest' | 'abdomen_navel' | 'arm_relaxed_midpoint' | 'arm_flexed_max';
export type MeasurementSelection = {
  key: MeasurementType;
  protocol: MeasurementProtocol | null;
  labelKey: TranslationKey;
  tipKey: TranslationKey;
  color: string;
};
export const MEASUREMENT_SELECTIONS: MeasurementSelection[] = [
  {
    key: 'waist',
    protocol: 'waist_iliac_crest',
    labelKey: 'health.waist',
    tipKey: 'health.measureTipWaist',
    color: '#14B8A6',
  },
  {
    key: 'abdomen',
    protocol: 'abdomen_navel',
    labelKey: 'health.abdomen',
    tipKey: 'health.measureTipAbdomen',
    color: '#10B981',
  },
  { key: 'hips', protocol: null, labelKey: 'health.hips', tipKey: 'health.measureTipHips', color: '#F59E0B' },
  { key: 'chest', protocol: null, labelKey: 'health.chest', tipKey: 'health.measureTipChest', color: '#3B82F6' },
  {
    key: 'arm',
    protocol: 'arm_relaxed_midpoint',
    labelKey: 'health.armRelaxed',
    tipKey: 'health.measureTipArmRelaxed',
    color: '#8B5CF6',
  },
  {
    key: 'arm',
    protocol: 'arm_flexed_max',
    labelKey: 'health.armFlexed',
    tipKey: 'health.measureTipArmFlexed',
    color: '#8B5CF6',
  },
  { key: 'thigh', protocol: null, labelKey: 'health.thigh', tipKey: 'health.measureTipThigh', color: '#EC4899' },
];
export const measurementSeriesKey = (measurement: Pick<BodyMeasurement, 'measurement_type' | 'measurement_protocol'>) =>
  `${measurement.measurement_type}:${measurement.measurement_protocol ?? (measurement.measurement_type === 'abdomen' ? 'abdomen_navel' : 'unspecified')}`;
export const matchesMeasurementSeries = (
  measurement: Pick<BodyMeasurement, 'measurement_type' | 'measurement_protocol'>,
  type: MeasurementType,
  protocol: string | null,
) =>
  measurement.measurement_type === type &&
  ((measurement.measurement_protocol ?? null) === protocol ||
    (type === 'abdomen' && protocol === 'abdomen_navel' && !measurement.measurement_protocol));
export const getMeasurementLabelKey = (
  measurement: Pick<BodyMeasurement, 'measurement_type' | 'measurement_protocol'>,
): TranslationKey => {
  const { measurement_type: type, measurement_protocol: protocol } = measurement;
  if (type === 'arm')
    return protocol === 'arm_relaxed_midpoint'
      ? 'health.armRelaxed'
      : protocol === 'arm_flexed_max'
        ? 'health.armFlexed'
        : 'health.armUnspecified';
  if (type === 'waist' && protocol !== 'waist_iliac_crest') return 'health.waistUnspecified';
  const labels: Record<MeasurementType, TranslationKey> = {
    waist: 'health.waist',
    abdomen: 'health.abdomen',
    hips: 'health.hips',
    chest: 'health.chest',
    arm: 'health.arm',
    thigh: 'health.thigh',
    calf: 'health.calf',
    neck: 'health.neck',
    shoulders: 'health.shoulders',
  };
  return labels[type];
};
