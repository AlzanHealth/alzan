export function workoutSetProgress(
  id: string,
  target: number | null | undefined,
  extra: number,
  completedSets: ReadonlySet<string>,
) {
  const total = Math.max(0, (target ?? 3) + extra);
  const completed = Array.from({ length: total }, (_, index) => `${id}-${index + 1}`).filter(key =>
    completedSets.has(key),
  ).length;
  return { total, completed, canCollapse: total > 0 && completed === total };
}
