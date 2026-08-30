export type EnduranceMetricUnit = 'min/km' | 'min/100m' | 'km/h';
export type EnduranceMetricField = 'distance' | 'duration' | 'intensity';

export type EnduranceMetricValues = {
  distanceM: number | null;
  durationS: number | null;
  intensity: number | null;
};

function positive(value: number | null): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function calculateDistance(durationS: number, intensity: number, unit: EnduranceMetricUnit): number {
  if (unit === 'min/km') return (durationS / intensity) * 1000;
  if (unit === 'min/100m') return (durationS / intensity) * 100;
  return (durationS * intensity) / 3.6;
}

function calculateDuration(distanceM: number, intensity: number, unit: EnduranceMetricUnit): number {
  if (unit === 'min/km') return (distanceM / 1000) * intensity;
  if (unit === 'min/100m') return (distanceM / 100) * intensity;
  return (distanceM / intensity) * 3.6;
}

function calculateIntensity(durationS: number, distanceM: number, unit: EnduranceMetricUnit): number {
  if (unit === 'min/km') return durationS / (distanceM / 1000);
  if (unit === 'min/100m') return durationS / (distanceM / 100);
  return (distanceM / durationS) * 3.6;
}

/**
 * Derives the missing metric while keeping distance authoritative whenever it
 * has a positive value. A cleared distance can only be restored from duration
 * and intensity supplied by the user.
 */
export function deriveEnduranceMetricValues(
  values: EnduranceMetricValues,
  unit: EnduranceMetricUnit,
  changedField?: EnduranceMetricField,
): EnduranceMetricValues {
  const distanceM = positive(values.distanceM);
  const durationS = positive(values.durationS);
  const intensity = positive(values.intensity);
  const next = { ...values };

  if (changedField === 'duration' && durationS != null) {
    if (distanceM != null) next.intensity = calculateIntensity(durationS, distanceM, unit);
    else if (intensity != null) next.distanceM = calculateDistance(durationS, intensity, unit);
    return next;
  }

  if (changedField === 'distance') {
    if (distanceM != null) {
      if (durationS != null) next.intensity = calculateIntensity(durationS, distanceM, unit);
      else if (intensity != null) next.durationS = calculateDuration(distanceM, intensity, unit);
    } else if (durationS != null && intensity != null) {
      next.distanceM = calculateDistance(durationS, intensity, unit);
    }
    return next;
  }

  if (changedField === 'intensity' && intensity != null) {
    if (distanceM != null) next.durationS = calculateDuration(distanceM, intensity, unit);
    else if (durationS != null) next.distanceM = calculateDistance(durationS, intensity, unit);
    return next;
  }

  if (distanceM != null && durationS != null && intensity == null) {
    next.intensity = calculateIntensity(durationS, distanceM, unit);
  } else if (distanceM != null && intensity != null && durationS == null) {
    next.durationS = calculateDuration(distanceM, intensity, unit);
  } else if (distanceM == null && durationS != null && intensity != null) {
    next.distanceM = calculateDistance(durationS, intensity, unit);
  }

  return next;
}
