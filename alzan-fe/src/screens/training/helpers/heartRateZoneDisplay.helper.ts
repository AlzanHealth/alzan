export function getHeartRateZoneFillPercentage(durationS: number | null | undefined, maxDurationS: number): number {
  if (durationS == null || !Number.isFinite(durationS) || durationS <= 0) return 0;
  if (!Number.isFinite(maxDurationS) || maxDurationS <= 0) return 0;
  return Math.max(0, Math.min(100, (durationS / maxDurationS) * 100));
}
