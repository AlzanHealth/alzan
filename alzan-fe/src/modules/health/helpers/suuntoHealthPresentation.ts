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

export const aggregateDailyActivity = (rows: DailyActivityRow[], metric: 'steps' | 'energy'): ChartDataPoint[] =>
  rows
    .map(row => ({
      value: metric === 'steps' ? (row.total_steps ?? 0) : (row.calories_kcal ?? 0),
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
