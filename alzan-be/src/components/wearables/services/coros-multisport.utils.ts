import {
  CanonicalActivity,
  CanonicalActivityHeartRateZone,
  CanonicalActivityMetricSample,
} from '../../activity-import/parsers/activity-import-canonical.types';

function positive(value: number | null): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : 0;
}

function shiftMetricSamples(
  samples: CanonicalActivityMetricSample[],
  durationOffset: number,
  valueOffset = 0,
): CanonicalActivityMetricSample[] {
  return samples.map(sample => ({
    ...sample,
    offsetSeconds: sample.offsetSeconds == null ? null : sample.offsetSeconds + durationOffset,
    value: sample.value + valueOffset,
  }));
}

function mergeHeartRateZones(
  activities: CanonicalActivity[],
  totalDurationSeconds: number,
): CanonicalActivityHeartRateZone[] {
  const durations = new Map<CanonicalActivityHeartRateZone['zone'], number>();
  for (const activity of activities) {
    for (const zone of activity.heartRateZones) {
      durations.set(zone.zone, (durations.get(zone.zone) ?? 0) + zone.durationSeconds);
    }
  }
  return [...durations.entries()].map(([zone, durationSeconds]) => ({
    zone,
    durationSeconds,
    percentage: totalDurationSeconds > 0 ? (durationSeconds / totalDurationSeconds) * 100 : 0,
  }));
}

export function mergeCorosMultisportActivities(activities: CanonicalActivity[]): CanonicalActivity {
  const first = activities[0];
  if (!first) throw new Error('COROS_FIT_ACTIVITY_MISSING');
  if (activities.length === 1) return first;

  let durationOffset = 0;
  let distanceOffset = 0;
  const streams: CanonicalActivity['streams'] = {
    position: [],
    heartRate: [],
    speed: [],
    distance: [],
    altitude: [],
    cadence: [],
    power: [],
    temperature: [],
  };
  const laps: CanonicalActivity['laps'] = [];

  for (const activity of activities) {
    streams.position.push(
      ...activity.streams.position.map(sample => ({
        ...sample,
        offsetSeconds: sample.offsetSeconds == null ? null : sample.offsetSeconds + durationOffset,
        distanceM: sample.distanceM == null ? null : sample.distanceM + distanceOffset,
      })),
    );
    streams.heartRate.push(...shiftMetricSamples(activity.streams.heartRate, durationOffset));
    streams.speed.push(...shiftMetricSamples(activity.streams.speed, durationOffset));
    streams.distance.push(...shiftMetricSamples(activity.streams.distance, durationOffset, distanceOffset));
    streams.altitude.push(...shiftMetricSamples(activity.streams.altitude, durationOffset));
    streams.cadence.push(...shiftMetricSamples(activity.streams.cadence, durationOffset));
    streams.power.push(...shiftMetricSamples(activity.streams.power, durationOffset));
    streams.temperature.push(...shiftMetricSamples(activity.streams.temperature, durationOffset));
    laps.push(
      ...activity.laps.map(lap => ({
        ...lap,
        lapIndex: laps.length + lap.lapIndex,
        startOffsetSeconds: lap.startOffsetSeconds == null ? null : lap.startOffsetSeconds + durationOffset,
        endOffsetSeconds: lap.endOffsetSeconds == null ? null : lap.endOffsetSeconds + durationOffset,
      })),
    );
    durationOffset += positive(activity.summary.durationSeconds);
    distanceOffset += positive(activity.summary.distanceM);
  }

  const last = activities[activities.length - 1];
  return {
    ...first,
    summary: {
      ...first.summary,
      startedAt: first.summary.startedAt,
      endedAt: last.summary.endedAt,
      durationSeconds: durationOffset || null,
      elapsedSeconds: durationOffset || null,
      distanceM: distanceOffset || null,
    },
    streams,
    laps,
    heartRateZones: mergeHeartRateZones(activities, durationOffset),
    device: activities.find(activity => activity.device != null)?.device ?? null,
    vendorFields: {
      ...first.vendorFields,
      corosMultisportLegs: activities.map(activity => ({
        sportType: activity.sportType,
        sportSubtype: activity.sportSubtype,
        summary: activity.summary,
      })),
    },
  };
}
