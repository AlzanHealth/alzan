export function buildCorosHistoricalSourceRecordId(
  providerActivityId: string | null | undefined,
  fileHash: string,
): string {
  const normalizedProviderActivityId = providerActivityId?.trim();
  return normalizedProviderActivityId ? normalizedProviderActivityId : `fit:${fileHash}`;
}

export function isLikelyCorosHistoricalDuplicate(input: {
  candidateStartedAt: string | null;
  candidateDurationSeconds: number | null;
  candidateDistanceM: number | null;
  existingStartedAt: string | null;
  existingDurationSeconds: number | null;
  existingDistanceM: number | null;
}): boolean {
  if (!input.candidateStartedAt || !input.existingStartedAt) return false;
  const candidateStart = Date.parse(input.candidateStartedAt);
  const existingStart = Date.parse(input.existingStartedAt);
  if (!Number.isFinite(candidateStart) || !Number.isFinite(existingStart)) return false;
  if (Math.abs(candidateStart - existingStart) > 5 * 60_000) return false;
  if (
    input.candidateDurationSeconds != null &&
    input.existingDurationSeconds != null &&
    Math.abs(input.candidateDurationSeconds - input.existingDurationSeconds) > 120
  ) {
    return false;
  }
  if (input.candidateDistanceM != null && input.existingDistanceM != null) {
    const distanceTolerance = Math.max(100, Math.max(input.candidateDistanceM, input.existingDistanceM) * 0.02);
    if (Math.abs(input.candidateDistanceM - input.existingDistanceM) > distanceTolerance) return false;
  }
  return true;
}
