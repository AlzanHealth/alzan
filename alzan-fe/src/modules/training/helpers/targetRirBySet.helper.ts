export type TargetRirBySet = Array<number | null> | null;

/**
 * Converts the JSONB value returned by Supabase into the app's RIR vector.
 * Invalid data is ignored so malformed targets never affect the active workout.
 */
export const parseTargetRirBySet = (value: unknown, expectedSetCount?: number | null): TargetRirBySet => {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  if (expectedSetCount != null && value.length !== expectedSetCount) return null;

  const targets: Array<number | null> = [];
  for (const target of value) {
    if (target === null) {
      targets.push(null);
      continue;
    }

    if (typeof target !== 'number' || !Number.isInteger(target) || target < 0 || target > 10) return null;
    targets.push(target);
  }

  return targets;
};
