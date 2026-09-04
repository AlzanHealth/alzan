import { DistanceUnit, EnergyUnit, SportType, WeightUnit } from '../types/requests.types';

// Constants for conversion
const METERS_TO_MILES = 0.000621371;
const MILES_TO_METERS = 1609.34;
const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;
const KCAL_TO_KJ = 4.184;
const KJ_TO_KCAL = 0.239006;

export const formatPaceTime = (secondsPerUnit: number): string => {
  const normalizedSeconds = Math.max(0, Math.round(secondsPerUnit));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatDurationTime = (seconds: number): string => {
  const normalizedSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hrs = Math.floor(normalizedSeconds / 3600);
  const mins = Math.floor((normalizedSeconds % 3600) / 60);
  const secs = normalizedSeconds % 60;
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatPaceLabel = (secondsPerUnit: number, unit: string): string => {
  const separator = unit.startsWith('/') ? '' : ' ';
  return `${formatPaceTime(secondsPerUnit)}${separator}${unit}`;
};

export const convertDistanceToUi = (
  meters: number | null | undefined,
  distanceUnit: DistanceUnit = 'km',
  precision = 2,
) => {
  const isMetric = distanceUnit !== 'miles';
  if (meters === null || meters === undefined) return { value: 0, unit: isMetric ? 'km' : 'mi', label: '-' };

  let value: number;
  let unit: string;

  if (isMetric) {
    value = meters / 1000;
    unit = 'km';
  } else {
    value = meters * METERS_TO_MILES;
    unit = 'mi';
  }

  return {
    value: Number(value.toFixed(precision)),
    unit,
    label: `${value.toFixed(precision)} ${unit}`,
  };
};

export const convertWeightToUi = (kg: number | null | undefined, weightUnit: WeightUnit = 'kg', precision = 1) => {
  const isMetric = weightUnit !== 'lb';
  if (kg === null || kg === undefined) return { value: 0, unit: isMetric ? 'kg' : 'lb', label: '-' };

  let value: number;
  let unit: string;

  if (isMetric) {
    value = kg;
    unit = 'kg';
  } else {
    value = kg * KG_TO_LBS;
    unit = 'lb';
  }

  return {
    value: Number(value.toFixed(precision)),
    unit,
    label: `${value.toFixed(precision)} ${unit}`,
  };
};

export const convertSpeedToUi = (
  speedMetersPerSecond: number | null | undefined,
  sport: SportType = 'other',
  distanceUnit: DistanceUnit = 'km',
) => {
  const isMetric = distanceUnit !== 'miles';
  if (!speedMetersPerSecond || speedMetersPerSecond <= 0) return { value: 0, unit: '-', label: '-' };

  if (sport === 'cycling') {
    let speed: number;
    let unit: string;

    if (isMetric) {
      speed = speedMetersPerSecond * 3.6;
      unit = 'km/h';
    } else {
      speed = speedMetersPerSecond * 2.23694;
      unit = 'mph';
    }

    const roundedSpeed = Math.round(speed);
    return { value: roundedSpeed, unit, label: `${roundedSpeed} ${unit}` };
  } else if (sport === 'swimming') {
    const secondsPer100m = 100 / speedMetersPerSecond;

    if (isMetric) {
      return {
        value: secondsPer100m,
        unit: 'min/100m',
        label: formatPaceLabel(secondsPer100m, '/100m'),
      };
    } else {
      const secondsPer100yd = secondsPer100m / 1.09361;
      return {
        value: secondsPer100yd,
        unit: 'min/100yd',
        label: formatPaceLabel(secondsPer100yd, '/100yd'),
      };
    }
  } else {
    // Default (Running, Hiking, Padel, etc): Use Pace (min/km or min/mi)
    const metersPerMin = speedMetersPerSecond * 60;
    if (metersPerMin === 0) return { value: 0, unit: isMetric ? 'min/km' : 'min/mi', label: '-' };

    let paceMinPerUnit: number;
    let unit: string;

    if (isMetric) {
      paceMinPerUnit = 1000 / metersPerMin;
      unit = 'min/km';
    } else {
      paceMinPerUnit = 1609.34 / metersPerMin;
      unit = 'min/mi';
    }

    const label = formatPaceLabel(paceMinPerUnit * 60, unit);

    return { value: paceMinPerUnit, unit, label };
  }
};

export const parseDistanceToMeters = (value: number, distanceUnit: DistanceUnit = 'km') => {
  if (distanceUnit !== 'miles') {
    return value * 1000;
  } else {
    return value * MILES_TO_METERS;
  }
};

export const parseWeightToKg = (value: number, weightUnit: WeightUnit = 'kg') => {
  if (weightUnit !== 'lb') {
    return value;
  } else {
    return value * LBS_TO_KG;
  }
};

export const convertEnergyToUi = (kcal: number | null | undefined, energyUnit: EnergyUnit = 'kcal', precision = 0) => {
  const isKcal = energyUnit !== 'kj';
  if (kcal === null || kcal === undefined) return { value: 0, unit: isKcal ? 'kcal' : 'kJ', label: '-' };

  let value: number;
  let unit: string;

  if (isKcal) {
    value = kcal;
    unit = 'kcal';
  } else {
    value = kcal * KCAL_TO_KJ;
    unit = 'kJ';
  }

  return {
    value: Number(value.toFixed(precision)),
    unit,
    label: `${value.toFixed(precision)}${unit}`, // Usually no space for kJ/kcal in compact views, but let's see. Alzan design is usually clean.
  };
};

export const parseEnergyToKcal = (value: number, energyUnit: EnergyUnit = 'kcal') => {
  if (energyUnit !== 'kj') {
    return value;
  } else {
    return value * KJ_TO_KCAL;
  }
};

const CM_TO_IN = 0.393701;
const IN_TO_CM = 2.54;

export const convertLengthToUi = (cm: number | null | undefined, distanceUnit: DistanceUnit = 'km', precision = 1) => {
  const isMetric = distanceUnit !== 'miles';
  if (cm === null || cm === undefined) return { value: 0, unit: isMetric ? 'cm' : 'in', label: '-' };

  let value: number;
  let unit: string;

  if (isMetric) {
    value = cm;
    unit = 'cm';
  } else {
    value = cm * CM_TO_IN;
    unit = 'in';
  }

  return {
    value: Number(value.toFixed(precision)),
    unit,
    label: `${value.toFixed(precision)} ${unit}`,
  };
};

export const parseLengthToCm = (value: number, distanceUnit: DistanceUnit = 'km') => {
  if (distanceUnit !== 'miles') {
    return value;
  } else {
    return value * IN_TO_CM;
  }
};
