import { CanonicalActivity } from '../../activity-import/parsers/activity-import-canonical.types';
import { parseCorosActivityFileToCanonical } from '../../activity-import/parsers/coros-activity-canonical.mapper';
import { mergeCorosMultisportActivities } from './coros-multisport.utils';

type JsonRecord = Record<string, unknown>;

export interface CorosCanonicalActivityResult {
  activity: CanonicalActivity;
  fitPendingReason: string | null;
}

const SUMMARY_FIELDS: Array<keyof CanonicalActivity['summary']> = [
  'startedAt',
  'endedAt',
  'timezone',
  'startedAtLocal',
  'endedAtLocal',
  'durationSeconds',
  'elapsedSeconds',
  'distanceM',
  'caloriesKcal',
  'avgHeartRate',
  'maxHeartRate',
  'minHeartRate',
  'avgSpeedMps',
  'maxSpeedMps',
  'avgCadence',
  'maxCadence',
  'avgPowerW',
  'maxPowerW',
  'elevationGainM',
  'elevationLossM',
  'avgTemperatureC',
  'maxTemperatureC',
  'totalSteps',
  'recoveryTimeSeconds',
  'vo2Max',
  'epoc',
  'pte',
  'tss',
];

function mergeSummary(
  fitSummary: CanonicalActivity['summary'],
  officialSummary: CanonicalActivity['summary'],
): CanonicalActivity['summary'] {
  const merged = { ...fitSummary };
  for (const field of SUMMARY_FIELDS) {
    const officialValue = officialSummary[field];
    if (officialValue != null) Object.assign(merged, { [field]: officialValue });
  }
  return merged;
}

/**
 * COROS summaries are sufficient to create an activity. FIT is an enrichment
 * source: when it is unavailable, the activity must still be imported and
 * marked for a later retry.
 */
export function buildCorosCanonicalActivity(
  summary: JsonRecord,
  labelId: string,
  fitFiles: Uint8Array[],
  fitPendingReason: string | null,
): CorosCanonicalActivityResult {
  const summaryActivity = parseCorosActivityFileToCanonical(JSON.stringify(summary), `coros-${labelId}.json`);
  let activity = summaryActivity;

  if (fitFiles.length > 0) {
    const fitActivity = mergeCorosMultisportActivities(
      fitFiles.map((fitBytes, index) =>
        parseCorosActivityFileToCanonical(fitBytes, `coros-${labelId}-${index + 1}.fit`),
      ),
    );
    activity = {
      ...fitActivity,
      providerActivityId: labelId,
      sportType: summaryActivity.sportType,
      sportSubtype: summaryActivity.sportSubtype,
      summary: mergeSummary(fitActivity.summary, summaryActivity.summary),
      device: summaryActivity.device ?? fitActivity.device,
      vendorFields: { ...fitActivity.vendorFields, ...summaryActivity.vendorFields },
    };
  } else {
    activity = { ...summaryActivity, providerActivityId: labelId };
  }

  return {
    activity: {
      ...activity,
      pendingWatchMetrics: fitPendingReason
        ? {
            provider: 'coros',
            providerActivityId: labelId,
            reason: fitPendingReason,
          }
        : null,
    },
    fitPendingReason,
  };
}
