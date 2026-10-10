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

export type StressStateCategory = 'invalid' | 'relaxing' | 'active' | 'passive' | 'stressful' | 'unknown';

export const getStressStateCategory = (value: number | null | undefined): StressStateCategory | null => {
  if (value == null) return null;
  if (value === 0) return 'invalid';
  if (value === 1) return 'relaxing';
  if (value === 2) return 'active';
  if (value === 3) return 'passive';
  if (value === 4) return 'stressful';
  return 'unknown';
};

export type HealthValueSummary = { average: number; min: number; max: number };

type ValueBucket = { sum: number; count: number };
type SuuntoSampleRow = { metric_type: string; value: number; recorded_at: string };
export type SuuntoSampleAggregate = {
  sampleCount: number;
  heartRate: ValueBucket;
  hrv: ValueBucket;
  heartRateBuckets: Record<string, ValueBucket>;
  hrvBuckets: Record<string, ValueBucket>;
  recoveryBuckets: Record<string, ValueBucket>;
  latestRecoveryBalance: number | null;
  latestStressState: number | null;
  stressCounts: StressStateCounts;
};

const addBucketValue = (buckets: Record<string, ValueBucket>, key: number, value: number): void => {
  const bucket = buckets[key] ?? { sum: 0, count: 0 };
  bucket.sum += value;
  bucket.count += 1;
  buckets[key] = bucket;
};

export const createSuuntoSampleAggregate = (): SuuntoSampleAggregate => ({
  sampleCount: 0,
  heartRate: { sum: 0, count: 0 },
  hrv: { sum: 0, count: 0 },
  heartRateBuckets: {},
  hrvBuckets: {},
  recoveryBuckets: {},
  latestRecoveryBalance: null,
  latestStressState: null,
  stressCounts: { relaxing: 0, active: 0, passive: 0, stressful: 0 },
});

export const addSuuntoSamplePage = (
  aggregate: SuuntoSampleAggregate,
  rows: SuuntoSampleRow[],
  bucketSizeMs: number,
): void => {
  for (const row of rows) {
    const value = Number(row.value);
    const recordedAt = Date.parse(row.recorded_at);
    aggregate.sampleCount += 1;
    if (row.metric_type === 'heart_rate') {
      aggregate.heartRate.sum += value;
      aggregate.heartRate.count += 1;
      addBucketValue(aggregate.heartRateBuckets, Math.floor(recordedAt / bucketSizeMs) * bucketSizeMs, value);
    } else if (row.metric_type === 'hrv_rmssd') {
      aggregate.hrv.sum += value;
      aggregate.hrv.count += 1;
      addBucketValue(aggregate.hrvBuckets, Math.floor(recordedAt / bucketSizeMs) * bucketSizeMs, value);
    } else if (row.metric_type === 'recovery_balance') {
      aggregate.latestRecoveryBalance = value;
      const day = new Date(recordedAt);
      day.setHours(0, 0, 0, 0);
      addBucketValue(aggregate.recoveryBuckets, day.getTime(), value * 100);
    } else if (row.metric_type === 'stress_state') {
      aggregate.latestStressState = value;
      if (value === 1) aggregate.stressCounts.relaxing += 1;
      if (value === 2) aggregate.stressCounts.active += 1;
      if (value === 3) aggregate.stressCounts.passive += 1;
      if (value === 4) aggregate.stressCounts.stressful += 1;
    }
  }
};

export const summarizeHealthValues = (values: number[]): HealthValueSummary | null => {
  if (values.length === 0) return null;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return {
    average: Math.round(sum / values.length),
    min: Math.round(min),
    max: Math.round(max),
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
