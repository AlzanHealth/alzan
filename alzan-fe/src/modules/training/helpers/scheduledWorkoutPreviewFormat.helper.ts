import {
  convertDistanceToUi,
  convertSpeedToUi,
  convertWeightToUi,
  formatDurationTime,
} from '../../../utils/unitConversionUtils';
import { DistanceUnit, DurationType, SportType, TargetType, WeightUnit } from '../../../types/requests.types';
import { isTimeBasedGymExerciseType } from './gymExerciseDefaults.helper';

export type PreviewLabels = {
  reps: string;
  sets: string;
  time: string;
  rest: string;
  hrZone: string;
  heartRate: string;
  pace: string;
  speed: string;
  power: string;
  distance: string;
  duration: string;
  load: string;
};

export type GymExercisePreviewInput = {
  target_sets?: number | null;
  target_reps_min?: number | null;
  target_reps_max?: number | null;
  rest_seconds?: number | null;
  exercise?: {
    load_type?: string | null;
    exercise_type_code?: string | null;
  } | null;
};

export type EnduranceStepPreviewInput = {
  duration_type: DurationType;
  duration_s?: number | null;
  distance_m?: number | null;
  target_type?: TargetType | null;
  target_min?: number | null;
  target_max?: number | null;
  repetitions?: number | null;
  hyrox_step_type?: string | null;
  load_kg?: number | null;
  reps?: number | null;
};

export type EnduranceStepTargetFormatOptions = {
  includeLabel?: boolean;
};

const formatNumber = (value: number, precision = 1): string => {
  const rounded = Number(value.toFixed(precision));
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
};

const formatRange = (
  min: number | null | undefined,
  max: number | null | undefined,
  formatter: (value: number) => string,
) => {
  if (min == null && max == null) return null;
  if (min != null && max != null) return min === max ? formatter(min) : `${formatter(min)} - ${formatter(max)}`;
  return formatter(min ?? max ?? 0);
};

const formatPreviewDuration = formatDurationTime;

export const formatGymExercisePrescription = (exercise: GymExercisePreviewInput, labels: PreviewLabels): string => {
  const parts: string[] = [];
  const sets = exercise.target_sets ?? 1;
  const min = exercise.target_reps_min ?? exercise.target_reps_max ?? 0;
  const max = exercise.target_reps_max ?? exercise.target_reps_min ?? min;
  const isTimeBased = exercise.exercise?.exercise_type_code
    ? isTimeBasedGymExerciseType(exercise.exercise.exercise_type_code)
    : exercise.exercise?.load_type === 'time';

  parts.push(`${sets} ${labels.sets}`);

  if (isTimeBased) {
    parts.push(`${min === max ? min : `${min}-${max}`} s`);
  } else {
    parts.push(`${min === max ? min : `${min}-${max}`} ${labels.reps.toLowerCase()}`);
  }

  if (exercise.rest_seconds && exercise.rest_seconds > 0) {
    parts.push(`${labels.rest} ${formatPreviewDuration(exercise.rest_seconds)}`);
  }

  return parts.join(' · ');
};

export const formatEnduranceStepDuration = (
  step: EnduranceStepPreviewInput,
  labels: PreviewLabels,
  distanceUnit: DistanceUnit = 'km',
): string | null => {
  if (step.duration_type === 'distance' && step.distance_m && step.distance_m > 0) {
    return `${labels.distance}: ${convertDistanceToUi(step.distance_m, distanceUnit, 2).label}`;
  }

  if (step.duration_type === 'time' && step.duration_s && step.duration_s > 0) {
    return `${labels.duration}: ${formatPreviewDuration(step.duration_s)}`;
  }

  return null;
};

export const formatEnduranceStepTarget = (
  step: EnduranceStepPreviewInput,
  sportType: SportType,
  labels: PreviewLabels,
  distanceUnit: DistanceUnit = 'km',
  options: EnduranceStepTargetFormatOptions = {},
): string | null => {
  const extras: string[] = [];
  const includeLabel = options.includeLabel ?? true;

  if (step.target_type && step.target_type !== 'none') {
    const min = step.target_min;
    const max = step.target_max;

    if (step.target_type === 'heart_rate_zone' || (step.target_type === 'heart_rate' && (max ?? min ?? 0) <= 5)) {
      const zone = max ?? min;
      if (zone != null) extras.push(`${includeLabel ? `${labels.hrZone} ` : ''}${Math.round(zone)}`);
    } else if (step.target_type === 'heart_rate') {
      const value = formatRange(min, max, item => `${Math.round(item)} bpm`);
      if (value) extras.push(`${includeLabel ? `${labels.heartRate}: ` : ''}${value}`);
    } else if (step.target_type === 'pace') {
      const baseDistance = sportType === 'swimming' ? 100 : 1000;
      const value = formatRange(min, max, item => convertSpeedToUi(baseDistance / item, sportType, distanceUnit).label);
      if (value) extras.push(`${includeLabel ? `${labels.pace}: ` : ''}${value}`);
    } else if (step.target_type === 'speed') {
      const value = formatRange(
        min,
        max,
        item => convertSpeedToUi((item * 1000) / 3600, sportType, distanceUnit).label,
      );
      if (value) extras.push(`${includeLabel ? `${labels.speed}: ` : ''}${value}`);
    } else if (step.target_type === 'power') {
      const value = formatRange(min, max, item => `${Math.round(item)}W`);
      if (value) extras.push(`${includeLabel ? `${labels.power}: ` : ''}${value}`);
    } else if (step.target_type === 'rpe') {
      const value = formatRange(min, max, item => `RPE ${formatNumber(item)}`);
      if (value) extras.push(value);
    }
  }

  if (step.hyrox_step_type === 'station') {
    if (step.reps != null && step.reps > 0) extras.push(`${Math.round(step.reps)} ${labels.reps.toLowerCase()}`);
    if (step.load_kg != null && step.load_kg > 0) {
      extras.push(`${labels.load}: ${convertWeightToUi(step.load_kg, 'kg', 1).label}`);
    }
  }

  return extras.length > 0 ? extras.join(' · ') : null;
};

export const formatHyroxLoad = (loadKg: number | null | undefined, weightUnit: WeightUnit = 'kg'): string | null => {
  if (loadKg == null || loadKg <= 0) return null;
  return convertWeightToUi(loadKg, weightUnit, 1).label;
};
