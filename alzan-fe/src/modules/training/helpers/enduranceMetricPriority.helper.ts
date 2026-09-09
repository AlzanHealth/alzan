export type EnduranceMetricUnit = 'min/km' | 'min/100m' | 'km/h';
export type EnduranceMetricField = 'distance' | 'duration' | 'intensity';
export type EnduranceMetricPriority = [EnduranceMetricField, EnduranceMetricField, EnduranceMetricField];

export const DEFAULT_ENDURANCE_METRIC_PRIORITY: EnduranceMetricPriority = ['intensity', 'duration', 'distance'];

export function normalizeEnduranceMetricPriority(value: unknown): EnduranceMetricPriority {
  const supplied = Array.isArray(value)
    ? value.filter(
        (field): field is EnduranceMetricField => field === 'distance' || field === 'duration' || field === 'intensity',
      )
    : [];
  const ordered = [...new Set([...supplied, ...DEFAULT_ENDURANCE_METRIC_PRIORITY])];

  return [ordered[0] ?? 'intensity', ordered[1] ?? 'duration', ordered[2] ?? 'distance'];
}

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

export function synchronizeEnduranceMetricValues(
  values: EnduranceMetricValues,
  unit: EnduranceMetricUnit,
  changedField: EnduranceMetricField | undefined,
  priority: EnduranceMetricPriority = DEFAULT_ENDURANCE_METRIC_PRIORITY,
): EnduranceMetricValues {
  return deriveEnduranceMetricValues(values, unit, changedField, normalizeEnduranceMetricPriority(priority));
}

/**
 * Recalculates the lowest-priority metric when one of the other metrics
 * changes. With the default priority, pace/speed and time are preserved and
 * distance is recalculated.
 */
export function deriveEnduranceMetricValues(
  values: EnduranceMetricValues,
  unit: EnduranceMetricUnit,
  changedField?: EnduranceMetricField,
  priority: EnduranceMetricPriority = DEFAULT_ENDURANCE_METRIC_PRIORITY,
): EnduranceMetricValues {
  const distanceM = positive(values.distanceM);
  const durationS = positive(values.durationS);
  const intensity = positive(values.intensity);
  const next = { ...values };

  const deriveField = (field: EnduranceMetricField): boolean => {
    if (field === 'distance' && durationS != null && intensity != null) {
      next.distanceM = calculateDistance(durationS, intensity, unit);
      return true;
    }
    if (field === 'duration' && distanceM != null && intensity != null) {
      next.durationS = calculateDuration(distanceM, intensity, unit);
      return true;
    }
    if (field === 'intensity' && distanceM != null && durationS != null) {
      next.intensity = calculateIntensity(durationS, distanceM, unit);
      return true;
    }
    return false;
  };

  if (changedField != null) {
    const targetField = changedField === priority[2] ? priority[1] : priority[2];
    if (deriveField(targetField)) return next;
  }

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
