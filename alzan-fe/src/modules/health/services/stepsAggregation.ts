import { StepsRow } from './stepsApi';

/**
 * Collapse multiple sources for the same day into a single value per date.
 * Keep the largest recorded total, regardless of its source.
 */
export const aggregateStepsByDate = (rows: StepsRow[]): Map<string, number> => {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (existing === undefined || row.total_steps > existing) byDate.set(row.date, row.total_steps);
  }
  return byDate;
};
