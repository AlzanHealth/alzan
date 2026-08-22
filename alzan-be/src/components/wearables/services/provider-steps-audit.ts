export type StepsProviderAuditStatus = 'complete' | 'mapper_only' | 'activity_steps_only' | 'not_supported';

export type StepsProviderAuditItem = {
  provider: string;
  channel: 'cloud' | 'local_sdk' | 'file_import';
  status: StepsProviderAuditStatus;
  feedsDailySteps: boolean;
  feedsStepsScreen: boolean;
  hasPermissionOrScope: boolean;
  hasFetcher: boolean;
  hasCanonicalMapper: boolean;
  hasDailyStepsWriter: boolean;
  hasStepIntervals: boolean;
  hasRawPayloadStorage: boolean;
  hasIdempotentDailyWrite: boolean;
  hasFrontendAggregationCoverage: boolean;
  officialDocumentation: string;
  implementationNotes: string;
};

export type StepsProviderAuditSummary = {
  completeProviders: string[];
  missingDailyStepsProviders: string[];
  screenSourceOfTruth: 'daily_steps';
  items: StepsProviderAuditItem[];
};

export const STEPS_PROVIDER_AUDIT: StepsProviderAuditItem[] = [
  {
    provider: 'apple_health',
    channel: 'local_sdk',
    status: 'complete',
    feedsDailySteps: true,
    feedsStepsScreen: true,
    hasPermissionOrScope: true,
    hasFetcher: true,
    hasCanonicalMapper: true,
    hasDailyStepsWriter: true,
    hasStepIntervals: true,
    hasRawPayloadStorage: true,
    hasIdempotentDailyWrite: true,
    hasFrontendAggregationCoverage: true,
    officialDocumentation: 'Apple HealthKit HKQuantityTypeIdentifier.stepCount',
    implementationNotes:
      'HealthKit stepCount is read by the iOS native module, uploaded through local-sync, normalized by the Apple Health mapper, and persisted to daily_steps.',
  },
  {
    provider: 'health_connect',
    channel: 'local_sdk',
    status: 'complete',
    feedsDailySteps: true,
    feedsStepsScreen: true,
    hasPermissionOrScope: true,
    hasFetcher: true,
    hasCanonicalMapper: true,
    hasDailyStepsWriter: true,
    hasStepIntervals: true,
    hasRawPayloadStorage: true,
    hasIdempotentDailyWrite: true,
    hasFrontendAggregationCoverage: true,
    officialDocumentation: 'Android Health Connect StepsRecord.count',
    implementationNotes:
      'Health Connect reads StepsRecord for the selected DataOrigin package, uploads local daily_activity records, and writes daily_steps plus step_intervals.',
  },
  {
    provider: 'garmin',
    channel: 'cloud',
    status: 'mapper_only',
    feedsDailySteps: false,
    feedsStepsScreen: false,
    hasPermissionOrScope: false,
    hasFetcher: false,
    hasCanonicalMapper: true,
    hasDailyStepsWriter: true,
    hasStepIntervals: true,
    hasRawPayloadStorage: false,
    hasIdempotentDailyWrite: true,
    hasFrontendAggregationCoverage: true,
    officialDocumentation: 'Garmin Health API Daily/All-day summaries with steps, subject to partner access and scopes',
    implementationNotes:
      'OAuth and the Garmin daily activity mapper exist, but there is no Garmin cloud daily summary sync service or endpoint that writes daily_steps.',
  },
  {
    provider: 'suunto',
    channel: 'cloud',
    status: 'activity_steps_only',
    feedsDailySteps: false,
    feedsStepsScreen: false,
    hasPermissionOrScope: true,
    hasFetcher: true,
    hasCanonicalMapper: true,
    hasDailyStepsWriter: true,
    hasStepIntervals: false,
    hasRawPayloadStorage: true,
    hasIdempotentDailyWrite: true,
    hasFrontendAggregationCoverage: true,
    officialDocumentation:
      'Suunto Cloud API workouts/FIT export; daily activity steps require a confirmed available endpoint',
    implementationNotes:
      'Suunto cloud sync imports workouts and can persist workout total_steps to activity_sessions, but no productive Suunto daily activity path writes daily_steps.',
  },
  {
    provider: 'fitbit',
    channel: 'cloud',
    status: 'mapper_only',
    feedsDailySteps: false,
    feedsStepsScreen: false,
    hasPermissionOrScope: false,
    hasFetcher: false,
    hasCanonicalMapper: true,
    hasDailyStepsWriter: true,
    hasStepIntervals: true,
    hasRawPayloadStorage: false,
    hasIdempotentDailyWrite: true,
    hasFrontendAggregationCoverage: true,
    officialDocumentation: 'Fitbit Web API daily activity summary steps',
    implementationNotes: 'Daily activity mapper exists, but no Fitbit cloud daily activity sync writes daily_steps.',
  },
  {
    provider: 'oura',
    channel: 'cloud',
    status: 'mapper_only',
    feedsDailySteps: false,
    feedsStepsScreen: false,
    hasPermissionOrScope: false,
    hasFetcher: false,
    hasCanonicalMapper: true,
    hasDailyStepsWriter: true,
    hasStepIntervals: true,
    hasRawPayloadStorage: false,
    hasIdempotentDailyWrite: true,
    hasFrontendAggregationCoverage: true,
    officialDocumentation: 'Oura API daily activity steps',
    implementationNotes: 'Daily activity mapper exists, but no Oura cloud daily activity sync writes daily_steps.',
  },
  {
    provider: 'polar',
    channel: 'cloud',
    status: 'mapper_only',
    feedsDailySteps: false,
    feedsStepsScreen: false,
    hasPermissionOrScope: false,
    hasFetcher: false,
    hasCanonicalMapper: true,
    hasDailyStepsWriter: true,
    hasStepIntervals: true,
    hasRawPayloadStorage: false,
    hasIdempotentDailyWrite: true,
    hasFrontendAggregationCoverage: true,
    officialDocumentation: 'Polar AccessLink activity and continuous activity endpoints, subject to product access',
    implementationNotes: 'Cloud activity sync exists for Polar activities, but no daily steps sync writes daily_steps.',
  },
  {
    provider: 'whoop',
    channel: 'cloud',
    status: 'not_supported',
    feedsDailySteps: false,
    feedsStepsScreen: false,
    hasPermissionOrScope: false,
    hasFetcher: false,
    hasCanonicalMapper: false,
    hasDailyStepsWriter: true,
    hasStepIntervals: false,
    hasRawPayloadStorage: false,
    hasIdempotentDailyWrite: true,
    hasFrontendAggregationCoverage: true,
    officialDocumentation: 'WHOOP API cycle/sleep/recovery endpoints; steps are not modeled in the current mapper set',
    implementationNotes: 'WHOOP maps cycle, sleep, and recovery only; no daily steps mapper exists.',
  },
  {
    provider: 'coros',
    channel: 'cloud',
    status: 'complete',
    feedsDailySteps: true,
    feedsStepsScreen: true,
    hasPermissionOrScope: true,
    hasFetcher: true,
    hasCanonicalMapper: true,
    hasDailyStepsWriter: true,
    hasStepIntervals: false,
    hasRawPayloadStorage: true,
    hasIdempotentDailyWrite: true,
    hasFrontendAggregationCoverage: true,
    officialDocumentation: 'COROS OpenAPI /coros/daily/query `step`, subject to approved partner access',
    implementationNotes:
      'COROS cloud sync fetches authorized daily records in 30-day windows, stores raw payloads, maps happenDay/step, and idempotently writes daily_steps after versioned health consent.',
  },
  {
    provider: 'ultrahuman',
    channel: 'cloud',
    status: 'mapper_only',
    feedsDailySteps: false,
    feedsStepsScreen: false,
    hasPermissionOrScope: false,
    hasFetcher: false,
    hasCanonicalMapper: true,
    hasDailyStepsWriter: true,
    hasStepIntervals: true,
    hasRawPayloadStorage: false,
    hasIdempotentDailyWrite: true,
    hasFrontendAggregationCoverage: true,
    officialDocumentation: 'Ultrahuman daily metrics payloads, subject to available API access',
    implementationNotes:
      'Daily activity mapper exists, but no Ultrahuman cloud daily activity sync writes daily_steps.',
  },
];

export function getStepsProviderAuditSummary(): StepsProviderAuditSummary {
  const completeProviders = STEPS_PROVIDER_AUDIT.filter(item => item.feedsStepsScreen).map(item => item.provider);
  const missingDailyStepsProviders = STEPS_PROVIDER_AUDIT.filter(item => !item.feedsDailySteps).map(
    item => item.provider,
  );
  return {
    completeProviders,
    missingDailyStepsProviders,
    screenSourceOfTruth: 'daily_steps',
    items: STEPS_PROVIDER_AUDIT,
  };
}

export function assertStepsProviderAuditIsCoherent(items: StepsProviderAuditItem[] = STEPS_PROVIDER_AUDIT): void {
  for (const item of items) {
    if (item.feedsStepsScreen && !item.feedsDailySteps) {
      throw new Error(`${item.provider} cannot feed StepsChart without writing daily_steps`);
    }
    if (item.feedsDailySteps && !item.hasCanonicalMapper) {
      throw new Error(`${item.provider} cannot write daily_steps without a canonical daily activity mapper`);
    }
    if (item.feedsDailySteps && !item.hasDailyStepsWriter) {
      throw new Error(`${item.provider} cannot write daily_steps without the canonical health writer`);
    }
    if (item.status === 'complete' && !item.feedsStepsScreen) {
      throw new Error(`${item.provider} is marked complete but does not feed the Steps screen`);
    }
  }
}

if (require.main === module) {
  assertStepsProviderAuditIsCoherent();
  const summary = getStepsProviderAuditSummary();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
