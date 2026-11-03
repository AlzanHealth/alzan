const MAX_RUNNING_SHOE_INITIAL_KILOMETERS = 1e305;
const METERS_PER_KILOMETER = 1000;

export const parseRunningShoeInitialKilometers = (value: string): number | null => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return 0;
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(trimmedValue)) return null;

  const kilometers = Number(trimmedValue.replace(',', '.'));
  if (!Number.isFinite(kilometers) || kilometers < 0 || kilometers > MAX_RUNNING_SHOE_INITIAL_KILOMETERS) {
    return null;
  }

  return Number.isFinite(kilometers * METERS_PER_KILOMETER) ? kilometers : null;
};
