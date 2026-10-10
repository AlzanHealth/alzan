import type { ChartDataPoint } from '../../../components/stats/SimpleChart';

export type DailyActivityRow = {
  date: string;
  total_steps: number | null;
  calories_kcal: number | null;
};

export type StressStateCounts = {
  relaxing: number;
  active: number;
  passive: number;
  stressful: number;
};

export type HealthValueSummary = { average: number; min: number; max: number };

export const summarizeHealthValues = (values: number[]): HealthValueSummary | null => {
  if (values.length === 0) return null;
  return {
    average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    min: Math.round(Math.min(...values)),
    max: Math.round(Math.max(...values)),
  };
};

export const getHealthSummaryCardWidth = (): number | `${number}%` => '48%';

export const aggregateDailyActivity = (rows: DailyActivityRow[], metric: 'steps' | 'energy'): ChartDataPoint[] =>
  rows
    .filter(row => (metric === 'steps' ? row.total_steps : row.calories_kcal) !== null)
    .map(row => ({
      value: metric === 'steps' ? row.total_steps! : row.calories_kcal!,
      date: new Date(`${row.date}T12:00:00`),
      label: row.date,
    }))
    .sort((left, right) => left.date.getTime() - right.date.getTime());

export const countStressStates = (values: Array<number | null | undefined>): StressStateCounts =>
  values.reduce<StressStateCounts>(
    (counts, value) => {
      if (value === 1) counts.relaxing += 1;
      if (value === 2) counts.active += 1;
      if (value === 3) counts.passive += 1;
      if (value === 4) counts.stressful += 1;
      return counts;
    },
    { relaxing: 0, active: 0, passive: 0, stressful: 0 },
  );
