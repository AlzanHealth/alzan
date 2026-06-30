import { StepsRow } from './stepsApi';

/**
 * Collapse multiple sources for the same day into a single value per date.
 * Prefers the manual value, otherwise the largest reported total.
 */
export const aggregateStepsByDate = (rows: StepsRow[]): Map<string, number> => {
  const byDate = new Map<string, { value: number; manual: boolean }>();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (!existing) {
      byDate.set(row.date, { value: row.total_steps, manual: row.is_manual });
      continue;
    }
    // Manual wins; otherwise keep the highest total.
    if (row.is_manual && !existing.manual) {
      byDate.set(row.date, { value: row.total_steps, manual: true });
    } else if (row.is_manual === existing.manual && row.total_steps > existing.value) {
      byDate.set(row.date, { value: row.total_steps, manual: existing.manual });
    }
  }
  return new Map(Array.from(byDate.entries()).map(([date, v]) => [date, v.value]));
};
