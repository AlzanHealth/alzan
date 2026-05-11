import { CanonicalActivity, CanonicalSportSubtype, CanonicalSportType } from './activity-import-canonical.types';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';

/**
 * mapService.ts
 *
 * Pure TypeScript service (no React) for converting GPS route file formats
 * into Google-encoded polyline strings for storage in activity_sessions.
 *
 * Supported input formats:
 *  - Raw Google-encoded polyline string (.txt)
 *  - GPX 1.1 (.gpx)
 *  - TCX (.tcx)
 *  - FIT (.fit)
 *  - KML (.kml)
 *  - JSON route exports (.json)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** [latitude, longitude] pair in decimal degrees */
export type LatLon = [number, number];

export type SupportedRouteFormat = 'polyline' | 'gpx' | 'tcx' | 'fit' | 'kml' | 'json';

export interface RouteImportSummary {
  sportType: CanonicalSportType | null;
  sportSubtype: CanonicalSportSubtype | null;
  distanceM: number | null;
  durationSeconds: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  recoveryTimeSeconds: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  caloriesKcal: number | null;
  vo2Max: number | null;
  totalSteps: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgPowerW: number | null;
  maxPowerW: number | null;
  avgTemperatureC: number | null;
  maxTemperatureC: number | null;
}

export interface RouteImportLap {
  lapIndex: number;
  lapType: 'manual' | 'auto' | 'distance' | 'time' | 'unknown';
  distanceM: number;
  durationSeconds: number | null;
  avgPaceSecondsPerKm: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  startOffsetSeconds: number | null;
  endOffsetSeconds: number | null;
}

export interface RouteImportDistanceSplitBucket {
  splitDistanceM: number;
  laps: RouteImportLap[];
}

export interface RouteImportHeartRateZone {
  zone: 1 | 2 | 3 | 4 | 5;
  durationSeconds: number;
  percentage: number;
}

type RouteImportNumericSummaryKey = {
  [Key in keyof RouteImportSummary]: RouteImportSummary[Key] extends number | null ? Key : never;
}[keyof RouteImportSummary];

export interface RouteImportDetails {
  customSplits: RouteImportLap[];
  distanceSplits: RouteImportDistanceSplitBucket[];
  splits1k: RouteImportLap[];
  splits5k: RouteImportLap[];
  splits10k: RouteImportLap[];
  heartRateZones: RouteImportHeartRateZone[];
}

export interface ParsedRouteImport {
  polyline: string;
  summary: RouteImportSummary;
  details: RouteImportDetails;
}

export interface ParseRouteFileOptions {
  estimatedMaxHeartRate?: number | null;
}

interface RoutePoint {
  lat: number;
  lon: number;
  elevationM: number | null;
  timestampSeconds: number | null;
  heartRate: number | null;
  distanceM: number | null;
}

interface ParsedRoutePoints {
  points: RoutePoint[];
  summaryOverrides?: Partial<RouteImportSummary>;
  customSplits?: RouteImportLap[];
  heartRateZones?: RouteImportHeartRateZone[];
}

interface FitFieldDefinition {
  fieldNumber: number;
  size: number;
  baseType: number;
}

interface FitDeveloperFieldDefinition {
  size: number;
}

interface FitMessageDefinition {
  littleEndian: boolean;
  globalMessageNumber: number;
  fields: FitFieldDefinition[];
  developerFields: FitDeveloperFieldDefinition[];
}

interface FitParseState {
  points: RoutePoint[];
  summaryOverrides: Partial<RouteImportSummary>;
  fitCustomSplits: FitParsedLap[];
}

interface FitParsedLap {
  lapType: RouteImportLap['lapType'];
  distanceM: number;
  durationSeconds: number | null;
  avgPaceSecondsPerKm: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  startTimestampSeconds: number | null;
}

type JsonRecord = Record<string, unknown>;

const FIT_LOCAL_MESSAGE_TYPES = 16;
const FIT_LAP_MESSAGE_NUMBER = 19;
const FIT_SESSION_MESSAGE_NUMBER = 18;
const FIT_RECORD_MESSAGE_NUMBER = 20;
const FIT_EPOCH_OFFSET_SECONDS = 631065600;
const FIT_INVALID_SINT32 = 2147483647;
const FIT_SEMICIRCLES_TO_DEGREES = 180 / 2147483648;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const SPLIT_DISTANCE_TOLERANCE_M = 10;
const SPLIT_DURATION_TOLERANCE_SECONDS = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Generic helpers
// ─────────────────────────────────────────────────────────────────────────────

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readNumber(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function semicirclesToDegrees(value: number): number {
  return value * FIT_SEMICIRCLES_TO_DEGREES;
}

function haversineDistanceM(from: LatLon, to: LatLon): number {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;

  const earthRadiusM = 6371000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);

  const sinHalfLat = Math.sin(deltaLat / 2);
  const sinHalfLon = Math.sin(deltaLon / 2);

  const a = sinHalfLat * sinHalfLat + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinHalfLon * sinHalfLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusM * c;
}

function calculateDistanceFromCoords(coords: LatLon[]): number | null {
  if (coords.length < 2) return null;

  let total = 0;
  for (let index = 1; index < coords.length; index += 1) {
    total += haversineDistanceM(coords[index - 1], coords[index]);
  }

  return total > 0 ? total : null;
}

function calculateElevationGain(points: RoutePoint[]): number | null {
  let totalGain = 0;
  let hasElevation = false;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].elevationM;
    const current = points[index].elevationM;

    if (previous == null || current == null) continue;
    hasElevation = true;

    const delta = current - previous;
    if (delta > 0) totalGain += delta;
  }

  return hasElevation ? totalGain : null;
}

function calculateElevationLoss(points: RoutePoint[]): number | null {
  let totalLoss = 0;
  let hasElevation = false;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].elevationM;
    const current = points[index].elevationM;

    if (previous == null || current == null) continue;
    hasElevation = true;

    const delta = previous - current;
    if (delta > 0) totalLoss += delta;
  }

  return hasElevation ? totalLoss : null;
}

function calculateDurationFromPoints(points: RoutePoint[]): number | null {
  const timestamps = points
    .map(point => point.timestampSeconds)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);

  if (timestamps.length < 2) return null;

  const duration = timestamps[timestamps.length - 1] - timestamps[0];
  return duration > 0 ? duration : null;
}

function calculateAverageHeartRate(points: RoutePoint[]): number | null {
  const heartRates = points
    .map(point => point.heartRate)
    .filter((value): value is number => value != null && value > 0);

  if (heartRates.length === 0) return null;

  const total = heartRates.reduce((sum, value) => sum + value, 0);
  return total / heartRates.length;
}

function normaliseHeartRate(value: number): number {
  // Some exports encode heart rate as beats/second (e.g. 2.5), convert to bpm.
  if (value > 0 && value < 4) return value * 60;
  return value;
}

function valuesAreClose(a: number, b: number, absoluteTolerance: number): boolean {
  const delta = Math.abs(a - b);
  if (delta <= absoluteTolerance) return true;

  const relativeTolerance = Math.max(Math.abs(a), Math.abs(b)) * 0.02;
  return delta <= relativeTolerance;
}

function buildSplitIdentity(split: RouteImportLap): string {
  const distanceKey = Math.round(split.distanceM * 10) / 10;
  const durationKey = split.durationSeconds != null ? Math.round(split.durationSeconds * 10) / 10 : null;
  const startKey = split.startOffsetSeconds != null ? Math.round(split.startOffsetSeconds * 10) / 10 : null;
  const endKey = split.endOffsetSeconds != null ? Math.round(split.endOffsetSeconds * 10) / 10 : null;

  return `${split.lapType}|${distanceKey}|${durationKey ?? 'null'}|${startKey ?? 'null'}|${endKey ?? 'null'}`;
}

function isTotalLikeSplit(
  split: RouteImportLap,
  summaryDistanceM: number | null,
  summaryDurationSeconds: number | null,
): boolean {
  const hasSummaryDistance = summaryDistanceM != null && summaryDistanceM > 0;
  const hasSummaryDuration = summaryDurationSeconds != null && summaryDurationSeconds > 0;
  if (!hasSummaryDistance && !hasSummaryDuration) return false;

  const distanceMatches =
    hasSummaryDistance &&
    split.distanceM > 0 &&
    valuesAreClose(split.distanceM, summaryDistanceM, SPLIT_DISTANCE_TOLERANCE_M);

  const durationMatches =
    hasSummaryDuration &&
    split.durationSeconds != null &&
    split.durationSeconds > 0 &&
    valuesAreClose(split.durationSeconds, summaryDurationSeconds, SPLIT_DURATION_TOLERANCE_SECONDS);

  if (hasSummaryDistance && hasSummaryDuration) {
    return distanceMatches || durationMatches;
  }

  if (hasSummaryDistance) return distanceMatches;
  if (hasSummaryDuration) return durationMatches;
  return false;
}

function normaliseCustomSplits(
  splits: RouteImportLap[],
  summaryOverrides?: Partial<RouteImportSummary>,
): RouteImportLap[] {
  if (splits.length === 0) return [];

  const validSplits = splits.filter(
    split => split.distanceM > 0 || (split.durationSeconds != null && split.durationSeconds > 0),
  );
  if (validSplits.length === 0) return [];

  const summaryDistanceM = summaryOverrides?.distanceM ?? null;
  const summaryDurationSeconds = summaryOverrides?.durationSeconds ?? null;

  let workingSplits = [...validSplits];
  const hasSummaryReference =
    (summaryDistanceM != null && summaryDistanceM > 0) ||
    (summaryDurationSeconds != null && summaryDurationSeconds > 0);

  if (hasSummaryReference) {
    const totalLikeMask = workingSplits.map(split => isTotalLikeSplit(split, summaryDistanceM, summaryDurationSeconds));
    const hasNonTotalLike = totalLikeMask.some(isTotalLike => !isTotalLike);

    if (hasNonTotalLike) {
      workingSplits = workingSplits.filter((_, index) => !totalLikeMask[index]);
    } else {
      const firstTotalLikeIndex = totalLikeMask.findIndex(Boolean);
      workingSplits = firstTotalLikeIndex >= 0 ? [workingSplits[firstTotalLikeIndex]] : workingSplits.slice(0, 1);
    }
  }

  const seen = new Set<string>();
  const deduped: RouteImportLap[] = [];
  for (const split of workingSplits) {
    const identity = buildSplitIdentity(split);
    if (seen.has(identity)) continue;
    seen.add(identity);
    deduped.push(split);
  }

  return deduped.map((split, index) => ({
    ...split,
    lapIndex: index + 1,
  }));
}

function parseIsoTimestampToSeconds(raw: string): number | null {
  const timestampMs = Date.parse(raw);
  if (!Number.isFinite(timestampMs)) return null;
  return timestampMs / 1000;
}

function normaliseLatLonFromPossiblyRadians(value: number, isLatitude: boolean): number {
  // Suunto JSON exports can contain radians.
  if (Math.abs(value) <= Math.PI) return value * RADIANS_TO_DEGREES;

  if (isLatitude && Math.abs(value) <= 90) return value;
  if (!isLatitude && Math.abs(value) <= 180) return value;

  return value;
}

function parseXmlTagNumber(xml: string, tagName: string): number | null {
  const pattern = new RegExp(`<${tagName}[^>]*>([^<]+)</${tagName}>`, 'i');
  const match = pattern.exec(xml);
  if (!match) return null;
  return readNumber(match[1]);
}

function sumXmlTagNumbers(xml: string, tagName: string): number | null {
  const pattern = new RegExp(`<${tagName}[^>]*>([^<]+)</${tagName}>`, 'gi');
  let match: RegExpExecArray | null;
  let total = 0;
  let hasValues = false;

  while ((match = pattern.exec(xml)) !== null) {
    const value = readNumber(match[1]);
    if (value == null) continue;
    total += value;
    hasValues = true;
  }

  return hasValues ? total : null;
}

function buildSummaryFromPoints(
  points: RoutePoint[],
  coords: LatLon[],
  overrides: Partial<RouteImportSummary> = {},
): RouteImportSummary {
  const derivedDistance =
    points.length > 0
      ? points
          .map(point => point.distanceM)
          .filter((value): value is number => value != null)
          .reduce<number | null>((maxDistance, value) => {
            if (maxDistance == null) return value;
            return value > maxDistance ? value : maxDistance;
          }, null)
      : null;

  return {
    sportType: overrides.sportType ?? null,
    sportSubtype: overrides.sportSubtype ?? null,
    distanceM: overrides.distanceM ?? derivedDistance ?? calculateDistanceFromCoords(coords),
    durationSeconds: overrides.durationSeconds ?? calculateDurationFromPoints(points),
    elevationGainM: overrides.elevationGainM ?? calculateElevationGain(points),
    elevationLossM: overrides.elevationLossM ?? calculateElevationLoss(points),
    recoveryTimeSeconds: overrides.recoveryTimeSeconds ?? null,
    avgHeartRate: overrides.avgHeartRate ?? calculateAverageHeartRate(points),
    maxHeartRate: overrides.maxHeartRate ?? null,
    caloriesKcal: overrides.caloriesKcal ?? null,
    vo2Max: overrides.vo2Max ?? null,
    totalSteps: overrides.totalSteps ?? null,
    avgSpeedMps: overrides.avgSpeedMps ?? null,
    maxSpeedMps: overrides.maxSpeedMps ?? null,
    avgCadence: overrides.avgCadence ?? null,
    maxCadence: overrides.maxCadence ?? null,
    avgPowerW: overrides.avgPowerW ?? null,
    maxPowerW: overrides.maxPowerW ?? null,
    avgTemperatureC: overrides.avgTemperatureC ?? null,
    maxTemperatureC: overrides.maxTemperatureC ?? null,
  };
}

function mapPointsToCoords(points: RoutePoint[]): LatLon[] {
  return points.map(point => [point.lat, point.lon]);
}

interface RouteProgressPoint {
  cumulativeDistanceM: number;
  timestampSeconds: number | null;
  heartRate: number | null;
}

function buildRouteProgress(points: RoutePoint[]): RouteProgressPoint[] {
  if (points.length === 0) return [];

  const progress: RouteProgressPoint[] = [];
  let cumulativeDistanceM = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];

    if (index === 0) {
      const firstDistance = point.distanceM;
      cumulativeDistanceM = firstDistance != null && firstDistance > 0 ? firstDistance : 0;
    } else {
      const previousPoint = points[index - 1];
      const absoluteDistance = point.distanceM;

      if (absoluteDistance != null && absoluteDistance >= cumulativeDistanceM) {
        cumulativeDistanceM = absoluteDistance;
      } else {
        cumulativeDistanceM += haversineDistanceM([previousPoint.lat, previousPoint.lon], [point.lat, point.lon]);
      }
    }

    progress.push({
      cumulativeDistanceM,
      timestampSeconds: point.timestampSeconds,
      heartRate: point.heartRate,
    });
  }

  return progress;
}

function getTimestampAtDistance(progress: RouteProgressPoint[], targetDistanceM: number): number | null {
  if (progress.length === 0) return null;

  const firstTimed = progress.find(point => point.timestampSeconds != null);
  if (!firstTimed) return null;

  if (targetDistanceM <= progress[0].cumulativeDistanceM) {
    return progress[0].timestampSeconds ?? firstTimed.timestampSeconds;
  }

  for (let index = 1; index < progress.length; index += 1) {
    const previous = progress[index - 1];
    const current = progress[index];

    if (current.cumulativeDistanceM < targetDistanceM) continue;

    if (previous.timestampSeconds == null || current.timestampSeconds == null) {
      break;
    }

    const segmentDistance = current.cumulativeDistanceM - previous.cumulativeDistanceM;
    if (segmentDistance <= 0) return current.timestampSeconds;

    const ratio = (targetDistanceM - previous.cumulativeDistanceM) / segmentDistance;
    return previous.timestampSeconds + ratio * (current.timestampSeconds - previous.timestampSeconds);
  }

  const lastTimed = [...progress].reverse().find(point => point.timestampSeconds != null);
  return lastTimed?.timestampSeconds ?? null;
}

function getHeartRateStats(
  progress: RouteProgressPoint[],
  startDistanceM: number,
  endDistanceM: number,
): { avgHeartRate: number; maxHeartRate: number } | null {
  const values = progress
    .filter(point => point.cumulativeDistanceM > startDistanceM && point.cumulativeDistanceM <= endDistanceM)
    .map(point => point.heartRate)
    .filter((value): value is number => value != null && value > 0);

  if (values.length === 0) return null;

  const total = values.reduce((sum, value) => sum + value, 0);
  const max = values.reduce((highest, value) => (value > highest ? value : highest), values[0]);

  return {
    avgHeartRate: total / values.length,
    maxHeartRate: max,
  };
}

function buildDistanceSplits(points: RoutePoint[], splitDistanceM: number): RouteImportLap[] {
  if (splitDistanceM <= 0 || points.length < 2) return [];

  const progress = buildRouteProgress(points);
  if (progress.length < 2) return [];

  const totalDistanceM = progress[progress.length - 1].cumulativeDistanceM;
  if (totalDistanceM <= 0) return [];

  const boundaries: number[] = [];
  let nextBoundary = splitDistanceM;

  while (nextBoundary < totalDistanceM) {
    boundaries.push(nextBoundary);
    nextBoundary += splitDistanceM;
  }
  boundaries.push(totalDistanceM);

  const referenceTimestamp = getTimestampAtDistance(progress, 0);
  let previousBoundary = 0;
  const laps: RouteImportLap[] = [];

  for (const boundary of boundaries) {
    const lapDistanceM = boundary - previousBoundary;
    if (lapDistanceM <= 0) {
      previousBoundary = boundary;
      continue;
    }

    const startTimestamp = getTimestampAtDistance(progress, previousBoundary);
    const endTimestamp = getTimestampAtDistance(progress, boundary);
    const durationSeconds =
      startTimestamp != null && endTimestamp != null && endTimestamp > startTimestamp
        ? endTimestamp - startTimestamp
        : null;

    const heartRateStats = getHeartRateStats(progress, previousBoundary, boundary);

    laps.push({
      lapIndex: laps.length + 1,
      lapType: 'distance',
      distanceM: lapDistanceM,
      durationSeconds,
      avgPaceSecondsPerKm: durationSeconds != null ? durationSeconds / (lapDistanceM / 1000) : null,
      avgHeartRate: heartRateStats ? heartRateStats.avgHeartRate : null,
      maxHeartRate: heartRateStats ? heartRateStats.maxHeartRate : null,
      startOffsetSeconds:
        referenceTimestamp != null && startTimestamp != null ? Math.max(0, startTimestamp - referenceTimestamp) : null,
      endOffsetSeconds:
        referenceTimestamp != null && endTimestamp != null ? Math.max(0, endTimestamp - referenceTimestamp) : null,
    });

    previousBoundary = boundary;
  }

  return laps;
}

function buildDistanceSplitTargets(totalDistanceM: number): number[] {
  if (!Number.isFinite(totalDistanceM) || totalDistanceM <= 0) return [];

  const targets = new Set<number>();

  if (totalDistanceM >= 1000) {
    targets.add(1000);
  }

  const maxFiveKmStep = Math.floor(totalDistanceM / 5000);
  for (let step = 1; step <= maxFiveKmStep; step += 1) {
    targets.add(step * 5000);
  }

  const remainderToFiveKm = totalDistanceM % 5000;
  const shouldAddUpperBucket = remainderToFiveKm > SPLIT_DISTANCE_TOLERANCE_M || maxFiveKmStep === 0;

  if (shouldAddUpperBucket) {
    targets.add((maxFiveKmStep + 1) * 5000);
  }

  return Array.from(targets).sort((a, b) => a - b);
}

function resolveHeartRateZone(normalisedHeartRate: number): 1 | 2 | 3 | 4 | 5 {
  if (normalisedHeartRate >= 0.9) return 5;
  if (normalisedHeartRate >= 0.8) return 4;
  if (normalisedHeartRate >= 0.7) return 3;
  if (normalisedHeartRate >= 0.6) return 2;
  return 1;
}

function resolveEffectiveMaxHeartRate(
  heartRateSamples: number[],
  estimatedMaxHeartRate?: number | null,
): number | null {
  const safeEstimated =
    estimatedMaxHeartRate != null && Number.isFinite(estimatedMaxHeartRate) && estimatedMaxHeartRate > 0
      ? estimatedMaxHeartRate
      : null;

  if (safeEstimated != null) {
    return safeEstimated;
  }

  if (heartRateSamples.length === 0) {
    return null;
  }

  const observedMax = heartRateSamples.reduce(
    (highest, value) => (value > highest ? value : highest),
    heartRateSamples[0],
  );

  return Number.isFinite(observedMax) && observedMax > 0 ? observedMax : null;
}

function buildHeartRateZones(points: RoutePoint[], estimatedMaxHeartRate?: number | null): RouteImportHeartRateZone[] {
  const progress = buildRouteProgress(points);
  const heartRateSamples = progress
    .map(point => point.heartRate)
    .filter((value): value is number => value != null && value > 0);

  if (heartRateSamples.length === 0) return [];

  const maxHeartRate = resolveEffectiveMaxHeartRate(heartRateSamples, estimatedMaxHeartRate);
  if (maxHeartRate == null) return [];

  const durationsByZone = [0, 0, 0, 0, 0];
  let totalDurationSeconds = 0;
  let usedTimedIntervals = false;

  for (let index = 1; index < progress.length; index += 1) {
    const previous = progress[index - 1];
    const current = progress[index];
    const heartRate = previous.heartRate ?? current.heartRate;

    if (heartRate == null || heartRate <= 0) continue;
    if (previous.timestampSeconds == null || current.timestampSeconds == null) continue;

    const deltaSeconds = current.timestampSeconds - previous.timestampSeconds;
    if (deltaSeconds <= 0) continue;

    usedTimedIntervals = true;
    const zone = resolveHeartRateZone(heartRate / maxHeartRate);
    durationsByZone[zone - 1] += deltaSeconds;
    totalDurationSeconds += deltaSeconds;
  }

  if (!usedTimedIntervals) {
    for (const heartRate of heartRateSamples) {
      const zone = resolveHeartRateZone(heartRate / maxHeartRate);
      durationsByZone[zone - 1] += 1;
    }
    totalDurationSeconds = heartRateSamples.length;
  }

  if (totalDurationSeconds <= 0) return [];

  return ([5, 4, 3, 2, 1] as const).map(zone => {
    const zoneSeconds = durationsByZone[zone - 1];
    return {
      zone,
      durationSeconds: Math.round(zoneSeconds),
      percentage: (zoneSeconds / totalDurationSeconds) * 100,
    };
  });
}

function buildHeartRateZonesFromSamples(
  heartRateSamples: number[],
  estimatedMaxHeartRate?: number | null,
): RouteImportHeartRateZone[] {
  if (heartRateSamples.length === 0) return [];

  const normalisedSamples = heartRateSamples
    .filter(value => Number.isFinite(value) && value > 0)
    .map(value => normaliseHeartRate(value));

  if (normalisedSamples.length === 0) return [];

  const maxHeartRate = resolveEffectiveMaxHeartRate(normalisedSamples, estimatedMaxHeartRate);
  if (maxHeartRate == null) return [];

  const durationsByZone = [0, 0, 0, 0, 0];

  for (const heartRate of normalisedSamples) {
    const zone = resolveHeartRateZone(heartRate / maxHeartRate);
    durationsByZone[zone - 1] += 1;
  }

  const totalDurationSeconds = normalisedSamples.length;
  if (totalDurationSeconds <= 0) return [];

  return ([5, 4, 3, 2, 1] as const).map(zone => {
    const zoneSeconds = durationsByZone[zone - 1];
    return {
      zone,
      durationSeconds: Math.round(zoneSeconds),
      percentage: (zoneSeconds / totalDurationSeconds) * 100,
    };
  });
}

function readJsonZoneDuration(zones: JsonRecord, zone: 1 | 2 | 3 | 4 | 5): number | null {
  const upperCamel = `Zone${zone}Duration`;
  const lowerCamel = `zone${zone}Duration`;
  const snake = `zone${zone}_duration`;

  const value = readNumber(zones[upperCamel]) ?? readNumber(zones[lowerCamel]) ?? readNumber(zones[snake]);
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function parseHeartRateZonesFromJsonHeader(
  header: JsonRecord | null,
  fallbackDurationSeconds: number | null,
): RouteImportHeartRateZone[] | null {
  if (!header) return null;

  const zones = isRecord(header.HrZones) ? header.HrZones : isRecord(header.hrZones) ? header.hrZones : null;
  if (!zones) return null;

  const zoneDurations: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: readJsonZoneDuration(zones, 1) ?? 0,
    2: readJsonZoneDuration(zones, 2) ?? 0,
    3: readJsonZoneDuration(zones, 3) ?? 0,
    4: readJsonZoneDuration(zones, 4) ?? 0,
    5: readJsonZoneDuration(zones, 5) ?? 0,
  };

  const totalFromZones = zoneDurations[1] + zoneDurations[2] + zoneDurations[3] + zoneDurations[4] + zoneDurations[5];
  const totalDurationSeconds =
    totalFromZones > 0
      ? totalFromZones
      : fallbackDurationSeconds != null && Number.isFinite(fallbackDurationSeconds) && fallbackDurationSeconds > 0
        ? fallbackDurationSeconds
        : 0;

  if (totalDurationSeconds <= 0) return null;

  return ([5, 4, 3, 2, 1] as const).map(zone => {
    const zoneSeconds = zoneDurations[zone];
    return {
      zone,
      durationSeconds: Math.round(zoneSeconds),
      percentage: (zoneSeconds / totalDurationSeconds) * 100,
    };
  });
}

function finaliseParsedRoute(parsed: ParsedRoutePoints, options?: ParseRouteFileOptions): ParsedRouteImport {
  const coords = mapPointsToCoords(parsed.points);

  if (coords.length === 0) {
    const summary = buildSummaryFromPoints(parsed.points, coords, parsed.summaryOverrides);
    const hasSummary = Object.values(summary).some(value => typeof value === 'number' && Number.isFinite(value));
    const customSplits = parsed.customSplits ?? [];
    const heartRateZones = parsed.heartRateZones ?? [];

    if (!hasSummary && customSplits.length === 0 && heartRateZones.length === 0) {
      throw new Error('No GPS coordinates found in file.');
    }

    return {
      polyline: '',
      summary,
      details: {
        customSplits,
        distanceSplits: [],
        splits1k: [],
        splits5k: [],
        splits10k: [],
        heartRateZones,
      },
    };
  }

  const summary = buildSummaryFromPoints(parsed.points, coords, parsed.summaryOverrides);
  const totalDistanceM = summary.distanceM ?? 0;
  const distanceSplits = buildDistanceSplitTargets(totalDistanceM)
    .map(splitDistanceM => ({
      splitDistanceM,
      laps: buildDistanceSplits(parsed.points, splitDistanceM),
    }))
    .filter(bucket => bucket.laps.length > 0);

  const splits1k = distanceSplits.find(bucket => bucket.splitDistanceM === 1000)?.laps ?? [];
  const splits5k = distanceSplits.find(bucket => bucket.splitDistanceM === 5000)?.laps ?? [];
  const splits10k = distanceSplits.find(bucket => bucket.splitDistanceM === 10000)?.laps ?? [];

  return {
    polyline: encodePolyline(coords),
    summary,
    details: {
      customSplits: parsed.customSplits ?? [],
      distanceSplits,
      splits1k,
      splits5k,
      splits10k,
      heartRateZones: parsed.heartRateZones ?? buildHeartRateZones(parsed.points, options?.estimatedMaxHeartRate),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Polyline Encoder / Decoder
// Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode an array of [lat, lon] pairs to a Google-encoded polyline string.
 */
export function encodePolyline(coords: LatLon[]): string {
  let output = '';
  let prevLat = 0;
  let prevLon = 0;

  for (const [lat, lon] of coords) {
    output += encodeValue(Math.round(lat * 1e5) - prevLat);
    output += encodeValue(Math.round(lon * 1e5) - prevLon);
    prevLat = Math.round(lat * 1e5);
    prevLon = Math.round(lon * 1e5);
  }

  return output;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';
  while (v >= 0x20) {
    encoded += String.fromCharCode(((v & 0x1f) | 0x20) + 63);
    v >>= 5;
  }
  encoded += String.fromCharCode(v + 63);
  return encoded;
}

/**
 * Decode a Google-encoded polyline string into an array of [lat, lon] pairs.
 */
export function decodePolyline(encoded: string): LatLon[] {
  const coords: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    lon += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / 1e5, lon / 1e5]);
  }

  return coords;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format detector
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect the route format from filename extension.
 */
export function detectFormat(filename: string): SupportedRouteFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.gpx')) return 'gpx';
  if (lower.endsWith('.tcx')) return 'tcx';
  if (lower.endsWith('.fit')) return 'fit';
  if (lower.endsWith('.kml')) return 'kml';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.txt') || lower.endsWith('.polyline')) return 'polyline';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Polyline parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate and return a raw Google-encoded polyline string.
 * Throws if the string appears invalid (too short or non-printable characters).
 */
export function parsePolylineString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    throw new Error('Polyline string is too short to be valid.');
  }

  if (!/^[?-~]+$/.test(trimmed)) {
    throw new Error('Polyline string contains invalid characters.');
  }

  const coords = decodePolyline(trimmed);
  if (coords.length === 0) {
    throw new Error('Polyline string decoded to zero coordinates.');
  }

  return trimmed;
}

function parsePolylineDetailed(raw: string): ParsedRouteImport {
  const polyline = parsePolylineString(raw);
  const coords = decodePolyline(polyline);
  const points: RoutePoint[] = coords.map(([lat, lon]) => ({
    lat,
    lon,
    elevationM: null,
    timestampSeconds: null,
    heartRate: null,
    distanceM: null,
  }));

  return {
    polyline,
    summary: buildSummaryFromPoints(points, coords),
    details: {
      customSplits: [],
      distanceSplits: [],
      splits1k: [],
      splits5k: [],
      splits10k: [],
      heartRateZones: [],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GPX parser
// ─────────────────────────────────────────────────────────────────────────────

function collectGpxPointsFromTag(xml: string, tagName: 'trkpt' | 'rtept' | 'wpt'): RoutePoint[] {
  const points: RoutePoint[] = [];

  const pointPattern = new RegExp(
    `<${tagName}[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\\s\\S]*?)</${tagName}>`,
    'gi',
  );

  let match: RegExpExecArray | null;
  while ((match = pointPattern.exec(xml)) !== null) {
    const lat = readNumber(match[1]);
    const lon = readNumber(match[2]);
    if (lat == null || lon == null) continue;

    const block = match[3];
    const elevationM = parseXmlTagNumber(block, 'ele');

    const timeMatch = /<time[^>]*>([^<]+)<\/time>/i.exec(block);
    const timestampSeconds = timeMatch ? parseIsoTimestampToSeconds(timeMatch[1]) : null;

    const hrMatch = /<(?:\w+:)?hr[^>]*>([^<]+)<\/(?:\w+:)?hr>/i.exec(block);
    const heartRateRaw = hrMatch ? readNumber(hrMatch[1]) : null;

    points.push({
      lat,
      lon,
      elevationM,
      timestampSeconds,
      heartRate: heartRateRaw != null ? normaliseHeartRate(heartRateRaw) : null,
      distanceM: null,
    });
  }

  if (points.length > 0) return points;

  const selfClosingPattern = new RegExp(`<${tagName}[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*/?>`, 'gi');

  while ((match = selfClosingPattern.exec(xml)) !== null) {
    const lat = readNumber(match[1]);
    const lon = readNumber(match[2]);
    if (lat == null || lon == null) continue;

    points.push({
      lat,
      lon,
      elevationM: null,
      timestampSeconds: null,
      heartRate: null,
      distanceM: null,
    });
  }

  return points;
}

function parseGpxDetailed(xml: string, options?: ParseRouteFileOptions): ParsedRouteImport {
  const trkPoints = collectGpxPointsFromTag(xml, 'trkpt');
  const routePoints = trkPoints.length > 0 ? trkPoints : collectGpxPointsFromTag(xml, 'rtept');
  const points = routePoints.length > 0 ? routePoints : collectGpxPointsFromTag(xml, 'wpt');

  if (points.length === 0) {
    throw new Error('No GPS coordinates found in GPX file.');
  }

  return finaliseParsedRoute({ points }, options);
}

/**
 * Parse a GPX 1.1 XML string and return an encoded polyline.
 */
export function parseGpx(xml: string): string {
  return parseGpxDetailed(xml).polyline;
}

// ─────────────────────────────────────────────────────────────────────────────
// TCX parser
// ─────────────────────────────────────────────────────────────────────────────

function parseTcxDetailed(xml: string, options?: ParseRouteFileOptions): ParsedRouteImport {
  const points: RoutePoint[] = [];

  const trackpointPattern = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/gi;
  let trackpointMatch: RegExpExecArray | null;

  while ((trackpointMatch = trackpointPattern.exec(xml)) !== null) {
    const block = trackpointMatch[1];

    const lat = parseXmlTagNumber(block, 'LatitudeDegrees');
    const lon = parseXmlTagNumber(block, 'LongitudeDegrees');

    if (lat == null || lon == null) continue;

    const elevationM = parseXmlTagNumber(block, 'AltitudeMeters');

    const timeMatch = /<Time[^>]*>([^<]+)<\/Time>/i.exec(block);
    const timestampSeconds = timeMatch ? parseIsoTimestampToSeconds(timeMatch[1]) : null;

    let heartRate: number | null = null;
    const hrBlock = /<HeartRateBpm[^>]*>([\s\S]*?)<\/HeartRateBpm>/i.exec(block);
    if (hrBlock) {
      const hrValue = parseXmlTagNumber(hrBlock[1], 'Value');
      heartRate = hrValue != null ? normaliseHeartRate(hrValue) : null;
    }

    const distanceM = parseXmlTagNumber(block, 'DistanceMeters');

    points.push({
      lat,
      lon,
      elevationM,
      timestampSeconds,
      heartRate,
      distanceM,
    });
  }

  if (points.length === 0) {
    const positionPattern = /<Position>([\s\S]*?)<\/Position>/gi;
    let positionMatch: RegExpExecArray | null;

    while ((positionMatch = positionPattern.exec(xml)) !== null) {
      const block = positionMatch[1];
      const lat = parseXmlTagNumber(block, 'LatitudeDegrees');
      const lon = parseXmlTagNumber(block, 'LongitudeDegrees');

      if (lat == null || lon == null) continue;

      points.push({
        lat,
        lon,
        elevationM: null,
        timestampSeconds: null,
        heartRate: null,
        distanceM: null,
      });
    }
  }

  if (points.length === 0) {
    throw new Error('No GPS coordinates found in TCX file.');
  }

  const lapDurationSeconds = sumXmlTagNumbers(xml, 'TotalTimeSeconds');
  const lapDistanceM = sumXmlTagNumbers(xml, 'DistanceMeters');
  const lapCalories = sumXmlTagNumbers(xml, 'Calories');

  const averageHeartRateValues = (() => {
    const values: number[] = [];
    const pattern = /<AverageHeartRateBpm[^>]*>([\s\S]*?)<\/AverageHeartRateBpm>/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(xml)) !== null) {
      const value = parseXmlTagNumber(match[1], 'Value');
      if (value != null && value > 0) values.push(value);
    }

    return values;
  })();

  const avgHeartRate =
    averageHeartRateValues.length > 0
      ? averageHeartRateValues.reduce((sum, value) => sum + value, 0) / averageHeartRateValues.length
      : null;

  return finaliseParsedRoute(
    {
      points,
      summaryOverrides: {
        distanceM: lapDistanceM,
        durationSeconds: lapDurationSeconds,
        caloriesKcal: lapCalories,
        avgHeartRate,
      },
    },
    options,
  );
}

/**
 * Parse a TCX XML string and return an encoded polyline.
 */
export function parseTcx(xml: string): string {
  return parseTcxDetailed(xml).polyline;
}

// ─────────────────────────────────────────────────────────────────────────────
// KML parser
// ─────────────────────────────────────────────────────────────────────────────

function parseKmlDetailed(xml: string, options?: ParseRouteFileOptions): ParsedRouteImport {
  const points: RoutePoint[] = [];

  const coordinatesPattern = /<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi;
  let match: RegExpExecArray | null;

  while ((match = coordinatesPattern.exec(xml)) !== null) {
    const tuples = match[1].trim().split(/\s+/g);

    for (const tuple of tuples) {
      if (!tuple) continue;

      const [rawLon, rawLat, rawElevation] = tuple.split(',');
      const lat = readNumber(rawLat);
      const lon = readNumber(rawLon);
      if (lat == null || lon == null) continue;

      points.push({
        lat,
        lon,
        elevationM: readNumber(rawElevation),
        timestampSeconds: null,
        heartRate: null,
        distanceM: null,
      });
    }
  }

  if (points.length === 0) {
    throw new Error('No GPS coordinates found in KML file.');
  }

  return finaliseParsedRoute({ points }, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON parser
// ─────────────────────────────────────────────────────────────────────────────

function normaliseCaloriesFromEnergy(energyValue: number): number | null {
  if (!Number.isFinite(energyValue) || energyValue <= 0) return null;

  // Large energy values in sports exports are usually Joules.
  if (energyValue > 20000) {
    return energyValue / 4184;
  }

  return energyValue;
}

function readHeartRateFromJsonSample(sample: JsonRecord): number | null {
  const heartRateRaw =
    readNumber(sample.HR) ?? readNumber(sample.HeartRate) ?? readNumber(sample.heartRate) ?? readNumber(sample.hr);

  if (heartRateRaw == null || heartRateRaw <= 0) return null;
  return normaliseHeartRate(heartRateRaw);
}

function pushPointFromJsonSample(sample: JsonRecord, target: RoutePoint[]): void {
  const latRaw = readNumber(sample.Latitude) ?? readNumber(sample.latitude) ?? readNumber(sample.lat);
  const lonRaw =
    readNumber(sample.Longitude) ?? readNumber(sample.longitude) ?? readNumber(sample.lon) ?? readNumber(sample.lng);

  if (latRaw == null || lonRaw == null) return;

  const lat = normaliseLatLonFromPossiblyRadians(latRaw, true);
  const lon = normaliseLatLonFromPossiblyRadians(lonRaw, false);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return;
  }

  const timestampText =
    readString(sample.TimeISO8601) ?? readString(sample.UTC) ?? readString(sample.time) ?? readString(sample.timestamp);

  const timestampSeconds = timestampText ? parseIsoTimestampToSeconds(timestampText) : null;

  const elevationM = readNumber(sample.Altitude) ?? readNumber(sample.GPSAltitude) ?? readNumber(sample.elevation);

  const distanceM = readNumber(sample.Distance) ?? readNumber(sample.distance);

  target.push({
    lat,
    lon,
    elevationM,
    timestampSeconds,
    heartRate: readHeartRateFromJsonSample(sample),
    distanceM,
  });
}

function extractJsonCoordinatesRecursively(value: unknown, target: RoutePoint[], depth = 0): void {
  if (depth > 8) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      extractJsonCoordinatesRecursively(item, target, depth + 1);
    }
    return;
  }

  if (!isRecord(value)) return;

  pushPointFromJsonSample(value, target);

  for (const nestedValue of Object.values(value)) {
    if (nestedValue == null) continue;
    if (typeof nestedValue === 'object') {
      extractJsonCoordinatesRecursively(nestedValue, target, depth + 1);
    }
  }
}

function mapJsonWindowTypeToLapType(rawType: string | null): RouteImportLap['lapType'] {
  if (!rawType) return 'unknown';

  const value = rawType.toLowerCase();
  if (value.includes('autolap')) return 'auto';
  if (value.includes('manual') || value === 'lap' || value.endsWith('lap')) return 'manual';
  if (value.includes('distance')) return 'distance';
  if (value.includes('time')) return 'time';

  return 'unknown';
}

function readJsonWindowNestedMetric(window: JsonRecord, sectionKey: string, metricKey: string): number | null {
  const section = window[sectionKey];
  if (!Array.isArray(section) || section.length === 0) return null;
  const firstMetric = section[0];
  if (!isRecord(firstMetric)) return null;
  return readNumber(firstMetric[metricKey]);
}

function extractJsonCustomSplits(parsed: unknown, summaryOverrides: Partial<RouteImportSummary>): RouteImportLap[] {
  if (!isRecord(parsed)) return [];
  const deviceLog = isRecord(parsed.DeviceLog) ? parsed.DeviceLog : null;
  if (!deviceLog) return [];
  if (!Array.isArray(deviceLog.Windows)) return [];

  const summaryDistanceM = summaryOverrides.distanceM ?? null;
  const summaryDurationSeconds = summaryOverrides.durationSeconds ?? null;
  const candidates: Array<
    Omit<RouteImportLap, 'lapIndex' | 'startOffsetSeconds' | 'endOffsetSeconds'> & { isAutoLap: boolean }
  > = [];

  for (const rawWindowEntry of deviceLog.Windows) {
    if (!isRecord(rawWindowEntry)) continue;
    const window = isRecord(rawWindowEntry.Window) ? rawWindowEntry.Window : rawWindowEntry;

    const rawType = readString(window.Type) ?? readString(window.type);
    if (rawType != null) {
      const loweredType = rawType.toLowerCase();
      if (loweredType === 'activity' || loweredType === 'move') {
        continue;
      }
    }

    const distanceM = readNumber(window.Distance) ?? readNumber(window.distance) ?? readNumber(window.DistanceMax) ?? 0;
    const durationSeconds = readNumber(window.Duration) ?? readNumber(window.duration);

    const hasDistance = Number.isFinite(distanceM) && distanceM > 0;
    const hasDuration = durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0;
    if (!hasDistance && !hasDuration) continue;

    if (
      hasDistance &&
      hasDuration &&
      summaryDistanceM != null &&
      summaryDurationSeconds != null &&
      summaryDistanceM > 0 &&
      summaryDurationSeconds > 0 &&
      distanceM >= summaryDistanceM * 0.98 &&
      durationSeconds >= summaryDurationSeconds * 0.98
    ) {
      continue;
    }

    const avgSpeedMps = readJsonWindowNestedMetric(window, 'Speed', 'Avg');
    const avgHeartRateRaw = readJsonWindowNestedMetric(window, 'HR', 'Avg');
    const maxHeartRateRaw = readJsonWindowNestedMetric(window, 'HR', 'Max');

    const safeDurationSeconds = hasDuration ? durationSeconds : null;
    const safeDistanceM = hasDistance ? distanceM : 0;
    const avgHeartRate = avgHeartRateRaw != null && avgHeartRateRaw > 0 ? normaliseHeartRate(avgHeartRateRaw) : null;
    const maxHeartRate = maxHeartRateRaw != null && maxHeartRateRaw > 0 ? normaliseHeartRate(maxHeartRateRaw) : null;

    const avgPaceSecondsPerKm =
      avgSpeedMps != null && avgSpeedMps > 0
        ? 1000 / avgSpeedMps
        : safeDurationSeconds != null && safeDistanceM > 0
          ? safeDurationSeconds / (safeDistanceM / 1000)
          : null;
    const lapType = mapJsonWindowTypeToLapType(rawType);
    const isAutoLap = rawType != null && rawType.toLowerCase().includes('autolap');

    candidates.push({
      lapType,
      distanceM: safeDistanceM,
      durationSeconds: safeDurationSeconds,
      avgPaceSecondsPerKm,
      avgHeartRate,
      maxHeartRate,
      isAutoLap,
    });
  }

  if (candidates.length === 0) return [];

  const hasNonAutoLaps = candidates.some(candidate => !candidate.isAutoLap);
  const filteredCandidates = hasNonAutoLaps ? candidates.filter(candidate => !candidate.isAutoLap) : candidates;

  let fallbackOffsetSeconds = 0;
  const rawSplits = filteredCandidates.map((candidate, index) => {
    const startOffsetSeconds = fallbackOffsetSeconds;
    const endOffsetSeconds =
      candidate.durationSeconds != null ? fallbackOffsetSeconds + candidate.durationSeconds : null;

    if (candidate.durationSeconds != null) {
      fallbackOffsetSeconds += candidate.durationSeconds;
    }

    return {
      lapIndex: index + 1,
      lapType: candidate.lapType,
      distanceM: candidate.distanceM,
      durationSeconds: candidate.durationSeconds,
      avgPaceSecondsPerKm: candidate.avgPaceSecondsPerKm,
      avgHeartRate: candidate.avgHeartRate,
      maxHeartRate: candidate.maxHeartRate,
      startOffsetSeconds,
      endOffsetSeconds,
    };
  });

  return normaliseCustomSplits(rawSplits, summaryOverrides);
}

function parseJsonDetailed(
  rawJson: string,
  filename = 'activity.json',
  options?: ParseRouteFileOptions,
): ParsedRouteImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  try {
    const canonical = parseActivityFileToCanonical(rawJson, filename, options);
    if (
      canonical.provider === 'garmin' ||
      canonical.provider === 'strava' ||
      canonical.provider === 'polar' ||
      canonical.provider === 'fitbit' ||
      canonical.provider === 'oura'
    ) {
      return finaliseParsedRoute(
        {
          points: mapCanonicalActivityToRoutePoints(canonical),
          summaryOverrides: mergeCanonicalSummary({}, canonical),
          customSplits: mapCanonicalLapsToRouteLaps(canonical),
          heartRateZones: canonical.heartRateZones.length > 0 ? canonical.heartRateZones : undefined,
        },
        options,
      );
    }
  } catch {
    // Keep the legacy JSON route parser for non-Garmin exports.
  }

  const points: RoutePoint[] = [];
  const summaryOverrides: Partial<RouteImportSummary> = {};
  const heartRateSamples: number[] = [];
  let jsonHeader: JsonRecord | null = null;

  if (isRecord(parsed)) {
    const deviceLog = isRecord(parsed.DeviceLog) ? parsed.DeviceLog : null;

    if (deviceLog) {
      const header = isRecord(deviceLog.Header) ? deviceLog.Header : null;
      jsonHeader = header;

      if (header) {
        const distanceM = readNumber(header.Distance) ?? readNumber(header.distance);
        if (distanceM != null && distanceM > 0) {
          summaryOverrides.distanceM = distanceM;
        }

        const durationSeconds = readNumber(header.Duration) ?? readNumber(header.duration);
        if (durationSeconds != null && durationSeconds > 0) {
          summaryOverrides.durationSeconds = durationSeconds;
        }

        const ascent = readNumber(header.Ascent) ?? readNumber(header.ascent);
        if (ascent != null && ascent > 0) {
          summaryOverrides.elevationGainM = ascent;
        }

        const descent = readNumber(header.Descent) ?? readNumber(header.descent);
        if (descent != null && descent > 0) {
          summaryOverrides.elevationLossM = descent;
        }

        const recoveryTimeSeconds =
          readNumber(header.RecoveryTime) ?? readNumber(header.recoveryTime) ?? readNumber(header.RecoveryTimeSeconds);
        if (recoveryTimeSeconds != null && recoveryTimeSeconds > 0) {
          summaryOverrides.recoveryTimeSeconds = recoveryTimeSeconds;
        }

        const avgHeartRateRaw =
          readNumber(header.AverageHeartRate) ??
          readNumber(header.AvgHeartRate) ??
          readNumber(header.HeartRateAvg) ??
          readNumber(header.HR);

        if (avgHeartRateRaw != null && avgHeartRateRaw > 0) {
          summaryOverrides.avgHeartRate = normaliseHeartRate(avgHeartRateRaw);
        }

        const caloriesKcal =
          readNumber(header.Calories) ??
          readNumber(header.KCal) ??
          readNumber(header.Kcal) ??
          (() => {
            const energy = readNumber(header.Energy);
            return energy != null ? normaliseCaloriesFromEnergy(energy) : null;
          })();

        if (caloriesKcal != null && caloriesKcal > 0) {
          summaryOverrides.caloriesKcal = caloriesKcal;
        }

        const vo2Max = readNumber(header.MAXVO2) ?? readNumber(header.MaxVO2) ?? readNumber(header.VO2Max);
        if (vo2Max != null && vo2Max > 0) {
          summaryOverrides.vo2Max = vo2Max;
        }

        const totalSteps =
          readNumber(header.StepCount) ??
          readNumber(header.TotalSteps) ??
          readNumber(header.stepCount) ??
          readNumber(header.totalSteps);
        if (totalSteps != null && totalSteps > 0) {
          summaryOverrides.totalSteps = Math.round(totalSteps);
        }
      }

      if (Array.isArray(deviceLog.Samples)) {
        for (const sample of deviceLog.Samples) {
          if (!isRecord(sample)) continue;
          const heartRate = readHeartRateFromJsonSample(sample);
          if (heartRate != null && heartRate > 0) {
            heartRateSamples.push(heartRate);
          }
          pushPointFromJsonSample(sample, points);
        }
      }
    }
  }

  if (points.length === 0) {
    extractJsonCoordinatesRecursively(parsed, points);
  }

  if (points.length === 0) {
    throw new Error('No GPS coordinates found in JSON file.');
  }

  if (summaryOverrides.avgHeartRate == null && heartRateSamples.length > 0) {
    const totalHeartRate = heartRateSamples.reduce((sum, value) => sum + value, 0);
    summaryOverrides.avgHeartRate = totalHeartRate / heartRateSamples.length;
  }

  const customSplits = extractJsonCustomSplits(parsed, summaryOverrides);
  const jsonHeartRateZones =
    parseHeartRateZonesFromJsonHeader(jsonHeader, summaryOverrides.durationSeconds ?? null) ??
    buildHeartRateZonesFromSamples(heartRateSamples, options?.estimatedMaxHeartRate);

  return finaliseParsedRoute(
    {
      points,
      summaryOverrides,
      customSplits,
      heartRateZones: jsonHeartRateZones.length > 0 ? jsonHeartRateZones : undefined,
    },
    options,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIT parser
// ─────────────────────────────────────────────────────────────────────────────

function getFitBaseTypeSize(baseType: number): number | null {
  switch (baseType) {
    case 0x00:
    case 0x01:
    case 0x02:
    case 0x0a:
    case 0x0d:
      return 1;
    case 0x83:
    case 0x84:
    case 0x8b:
      return 2;
    case 0x85:
    case 0x86:
    case 0x88:
    case 0x8c:
      return 4;
    case 0x89:
    case 0x8e:
    case 0x8f:
    case 0x90:
      return 8;
    default:
      return null;
  }
}

function decodeFitFieldAsNumber(
  dataView: DataView,
  offset: number,
  size: number,
  baseType: number,
  littleEndian: boolean,
): number | null {
  const baseTypeSize = getFitBaseTypeSize(baseType);
  if (baseTypeSize == null || size < baseTypeSize) return null;

  switch (baseType) {
    case 0x00:
    case 0x02:
    case 0x0d: {
      const value = dataView.getUint8(offset);
      return value === 0xff ? null : value;
    }
    case 0x0a: {
      const value = dataView.getUint8(offset);
      return value === 0 ? null : value;
    }
    case 0x01: {
      const value = dataView.getInt8(offset);
      return value === 0x7f ? null : value;
    }
    case 0x83: {
      const value = dataView.getInt16(offset, littleEndian);
      return value === 0x7fff ? null : value;
    }
    case 0x84: {
      const value = dataView.getUint16(offset, littleEndian);
      return value === 0xffff ? null : value;
    }
    case 0x8b: {
      const value = dataView.getUint16(offset, littleEndian);
      return value === 0 ? null : value;
    }
    case 0x85: {
      const value = dataView.getInt32(offset, littleEndian);
      return value === 0x7fffffff ? null : value;
    }
    case 0x86: {
      const value = dataView.getUint32(offset, littleEndian);
      return value === 0xffffffff ? null : value;
    }
    case 0x8c: {
      const value = dataView.getUint32(offset, littleEndian);
      return value === 0 ? null : value;
    }
    case 0x88: {
      const value = dataView.getFloat32(offset, littleEndian);
      return Number.isFinite(value) ? value : null;
    }
    case 0x89: {
      const value = dataView.getFloat64(offset, littleEndian);
      return Number.isFinite(value) ? value : null;
    }
    default:
      return null;
  }
}

function parseFitDefinitionMessage(
  dataView: DataView,
  offset: number,
  dataEnd: number,
  recordHeader: number,
): { nextOffset: number; definition: FitMessageDefinition } {
  const hasDeveloperData = (recordHeader & 0x20) !== 0;

  if (offset + 5 > dataEnd) {
    throw new Error('Invalid FIT file: unexpected end of definition message.');
  }

  offset += 1; // reserved byte

  const architecture = dataView.getUint8(offset);
  offset += 1;

  const littleEndian = architecture === 0;
  const globalMessageNumber = dataView.getUint16(offset, littleEndian);
  offset += 2;

  const fieldCount = dataView.getUint8(offset);
  offset += 1;

  const fields: FitFieldDefinition[] = [];

  for (let index = 0; index < fieldCount; index += 1) {
    if (offset + 3 > dataEnd) {
      throw new Error('Invalid FIT file: truncated field definition.');
    }

    const fieldNumber = dataView.getUint8(offset);
    const size = dataView.getUint8(offset + 1);
    const baseType = dataView.getUint8(offset + 2);

    fields.push({ fieldNumber, size, baseType });
    offset += 3;
  }

  const developerFields: FitDeveloperFieldDefinition[] = [];

  if (hasDeveloperData) {
    if (offset + 1 > dataEnd) {
      throw new Error('Invalid FIT file: truncated developer field count.');
    }

    const developerFieldCount = dataView.getUint8(offset);
    offset += 1;

    for (let index = 0; index < developerFieldCount; index += 1) {
      if (offset + 3 > dataEnd) {
        throw new Error('Invalid FIT file: truncated developer field definitions.');
      }

      const size = dataView.getUint8(offset + 1);
      developerFields.push({ size });
      offset += 3;
    }
  }

  return {
    nextOffset: offset,
    definition: {
      littleEndian,
      globalMessageNumber,
      fields,
      developerFields,
    },
  };
}

function setFitSummaryOverride(
  summaryOverrides: Partial<RouteImportSummary>,
  key: RouteImportNumericSummaryKey,
  value: number | null,
): void {
  if (value == null || !Number.isFinite(value) || value <= 0) return;

  const current = summaryOverrides[key];
  if (current == null || value > current) {
    summaryOverrides[key] = value;
  }
}

function mapFitLapTriggerToLapType(triggerValue: number | null): RouteImportLap['lapType'] {
  if (triggerValue == null) return 'unknown';

  if (triggerValue === 0) return 'manual';
  if (triggerValue === 1) return 'time';
  if (triggerValue === 2) return 'distance';

  return 'unknown';
}

function buildCustomSplitsFromFitLaps(
  fitLaps: FitParsedLap[],
  summaryOverrides?: Partial<RouteImportSummary>,
): RouteImportLap[] {
  if (fitLaps.length === 0) return [];

  const firstStartTimestamp = fitLaps.find(lap => lap.startTimestampSeconds != null)?.startTimestampSeconds ?? null;
  let fallbackOffsetSeconds = 0;

  const rawSplits = fitLaps.map((lap, index) => {
    const durationSeconds =
      lap.durationSeconds != null && Number.isFinite(lap.durationSeconds) && lap.durationSeconds > 0
        ? lap.durationSeconds
        : null;

    const inferredStartOffset =
      lap.startTimestampSeconds != null && firstStartTimestamp != null
        ? Math.max(0, lap.startTimestampSeconds - firstStartTimestamp)
        : fallbackOffsetSeconds;

    const startOffsetSeconds = Number.isFinite(inferredStartOffset) ? inferredStartOffset : null;
    const endOffsetSeconds =
      startOffsetSeconds != null && durationSeconds != null
        ? Math.max(startOffsetSeconds, startOffsetSeconds + durationSeconds)
        : null;

    if (durationSeconds != null) {
      fallbackOffsetSeconds = endOffsetSeconds ?? fallbackOffsetSeconds + durationSeconds;
    }

    return {
      lapIndex: index + 1,
      lapType: lap.lapType,
      distanceM: lap.distanceM,
      durationSeconds,
      avgPaceSecondsPerKm: lap.avgPaceSecondsPerKm,
      avgHeartRate: lap.avgHeartRate,
      maxHeartRate: lap.maxHeartRate,
      startOffsetSeconds,
      endOffsetSeconds,
    };
  });

  return normaliseCustomSplits(rawSplits, summaryOverrides);
}

function mapCanonicalLapsToRouteLaps(canonical: CanonicalActivity): RouteImportLap[] {
  return canonical.laps
    .filter(
      lap => (lap.distanceM != null && lap.distanceM > 0) || (lap.durationSeconds != null && lap.durationSeconds > 0),
    )
    .map((lap, index) => ({
      lapIndex: index + 1,
      lapType: lap.lapType,
      distanceM: lap.distanceM ?? 0,
      durationSeconds: lap.durationSeconds,
      avgPaceSecondsPerKm: lap.avgPaceSecondsPerKm,
      avgHeartRate: lap.avgHeartRate,
      maxHeartRate: lap.maxHeartRate,
      startOffsetSeconds: lap.startOffsetSeconds,
      endOffsetSeconds: lap.endOffsetSeconds,
    }));
}

function mergeCanonicalSummary(
  target: Partial<RouteImportSummary>,
  canonical: CanonicalActivity | null,
): Partial<RouteImportSummary> {
  if (!canonical) return target;
  return {
    ...target,
    sportType: target.sportType ?? canonical.sportType,
    sportSubtype: target.sportSubtype ?? canonical.sportSubtype,
    distanceM: target.distanceM ?? canonical.summary.distanceM,
    durationSeconds: target.durationSeconds ?? canonical.summary.durationSeconds,
    elevationGainM: target.elevationGainM ?? canonical.summary.elevationGainM,
    elevationLossM: target.elevationLossM ?? canonical.summary.elevationLossM,
    recoveryTimeSeconds: target.recoveryTimeSeconds ?? canonical.summary.recoveryTimeSeconds,
    avgHeartRate: target.avgHeartRate ?? canonical.summary.avgHeartRate,
    maxHeartRate: target.maxHeartRate ?? canonical.summary.maxHeartRate,
    caloriesKcal: target.caloriesKcal ?? canonical.summary.caloriesKcal,
    vo2Max: target.vo2Max ?? canonical.summary.vo2Max,
    totalSteps: target.totalSteps ?? canonical.summary.totalSteps,
    avgSpeedMps: target.avgSpeedMps ?? canonical.summary.avgSpeedMps,
    maxSpeedMps: target.maxSpeedMps ?? canonical.summary.maxSpeedMps,
    avgCadence: target.avgCadence ?? canonical.summary.avgCadence,
    maxCadence: target.maxCadence ?? canonical.summary.maxCadence,
    avgPowerW: target.avgPowerW ?? canonical.summary.avgPowerW,
    maxPowerW: target.maxPowerW ?? canonical.summary.maxPowerW,
    avgTemperatureC: target.avgTemperatureC ?? canonical.summary.avgTemperatureC,
    maxTemperatureC: target.maxTemperatureC ?? canonical.summary.maxTemperatureC,
  };
}

function findCanonicalMetricAtOffset(
  samples: CanonicalActivity['streams']['heartRate'],
  offsetSeconds: number | null,
): number | null {
  if (samples.length === 0) return null;
  if (offsetSeconds == null) return samples[0]?.value ?? null;
  return (
    samples.find(sample => sample.offsetSeconds != null && Math.abs(sample.offsetSeconds - offsetSeconds) <= 1)
      ?.value ?? null
  );
}

function mapCanonicalStreamsToRoutePoints(canonical: CanonicalActivity): RoutePoint[] {
  return canonical.streams.position.map(point => ({
    lat: point.lat,
    lon: point.lon,
    elevationM: findCanonicalMetricAtOffset(canonical.streams.altitude, point.offsetSeconds),
    timestampSeconds: point.timestamp ? Math.round(new Date(point.timestamp).getTime() / 1000) : null,
    heartRate: findCanonicalMetricAtOffset(canonical.streams.heartRate, point.offsetSeconds),
    distanceM: findCanonicalMetricAtOffset(canonical.streams.distance, point.offsetSeconds),
  }));
}

function mapCanonicalPolylineToRoutePoints(canonical: CanonicalActivity): RoutePoint[] {
  const rawPolyline = canonical.vendorFields.stravaPolyline;
  if (typeof rawPolyline !== 'string' || rawPolyline.trim().length === 0) return [];
  try {
    return decodePolyline(rawPolyline).map(([lat, lon]) => ({
      lat,
      lon,
      elevationM: null,
      timestampSeconds: null,
      heartRate: null,
      distanceM: null,
    }));
  } catch {
    return [];
  }
}

function mapCanonicalActivityToRoutePoints(canonical: CanonicalActivity): RoutePoint[] {
  const streamPoints = mapCanonicalStreamsToRoutePoints(canonical);
  return streamPoints.length > 0 ? streamPoints : mapCanonicalPolylineToRoutePoints(canonical);
}

function parseFitDataMessage(
  dataView: DataView,
  offset: number,
  dataEnd: number,
  definition: FitMessageDefinition,
  state: FitParseState,
): number {
  let lat: number | null = null;
  let lon: number | null = null;
  let elevationM: number | null = null;
  let timestampSeconds: number | null = null;
  let heartRate: number | null = null;
  let distanceM: number | null = null;
  let lapDurationSeconds: number | null = null;
  let lapDistanceM: number | null = null;
  let lapAvgSpeedMps: number | null = null;
  let lapAvgHeartRate: number | null = null;
  let lapMaxHeartRate: number | null = null;
  let lapStartTimestampSeconds: number | null = null;
  let lapType: RouteImportLap['lapType'] = 'unknown';

  for (const field of definition.fields) {
    if (offset + field.size > dataEnd) {
      throw new Error('Invalid FIT file: unexpected end of data message.');
    }

    const numericValue = decodeFitFieldAsNumber(dataView, offset, field.size, field.baseType, definition.littleEndian);

    if (definition.globalMessageNumber === FIT_RECORD_MESSAGE_NUMBER) {
      if (field.fieldNumber === 0 && numericValue != null && numericValue !== FIT_INVALID_SINT32) {
        lat = semicirclesToDegrees(numericValue);
      } else if (field.fieldNumber === 1 && numericValue != null && numericValue !== FIT_INVALID_SINT32) {
        lon = semicirclesToDegrees(numericValue);
      } else if (field.fieldNumber === 2 && numericValue != null) {
        elevationM = numericValue / 5 - 500;
      } else if (field.fieldNumber === 3 && numericValue != null && numericValue > 0) {
        heartRate = numericValue;
      } else if (field.fieldNumber === 5 && numericValue != null && numericValue > 0) {
        distanceM = numericValue / 100;
      } else if (field.fieldNumber === 253 && numericValue != null) {
        timestampSeconds = numericValue + FIT_EPOCH_OFFSET_SECONDS;
      }
    }

    if (definition.globalMessageNumber === FIT_SESSION_MESSAGE_NUMBER) {
      if (field.fieldNumber === 8 && numericValue != null) {
        setFitSummaryOverride(state.summaryOverrides, 'durationSeconds', numericValue / 1000);
      } else if (field.fieldNumber === 7 && numericValue != null) {
        setFitSummaryOverride(state.summaryOverrides, 'durationSeconds', numericValue / 1000);
      } else if (field.fieldNumber === 9 && numericValue != null) {
        setFitSummaryOverride(state.summaryOverrides, 'distanceM', numericValue / 100);
      } else if (field.fieldNumber === 10 && numericValue != null) {
        setFitSummaryOverride(state.summaryOverrides, 'totalSteps', Math.round(numericValue));
      } else if (field.fieldNumber === 11 && numericValue != null) {
        setFitSummaryOverride(state.summaryOverrides, 'caloriesKcal', numericValue);
      } else if (field.fieldNumber === 16 && numericValue != null) {
        setFitSummaryOverride(state.summaryOverrides, 'avgHeartRate', numericValue);
      } else if (field.fieldNumber === 22 && numericValue != null) {
        setFitSummaryOverride(state.summaryOverrides, 'elevationGainM', numericValue);
      } else if (field.fieldNumber === 23 && numericValue != null) {
        setFitSummaryOverride(state.summaryOverrides, 'elevationLossM', numericValue);
      }
    }

    if (definition.globalMessageNumber === FIT_LAP_MESSAGE_NUMBER) {
      if (field.fieldNumber === 8 && numericValue != null && numericValue > 0) {
        lapDurationSeconds = numericValue / 1000;
      } else if (field.fieldNumber === 7 && numericValue != null && numericValue > 0 && lapDurationSeconds == null) {
        lapDurationSeconds = numericValue / 1000;
      } else if (field.fieldNumber === 9 && numericValue != null && numericValue > 0) {
        lapDistanceM = numericValue / 100;
      } else if (field.fieldNumber === 13 && numericValue != null && numericValue > 0) {
        lapAvgSpeedMps = numericValue / 1000;
      } else if (field.fieldNumber === 15 && numericValue != null && numericValue > 0) {
        lapAvgHeartRate = numericValue;
      } else if (field.fieldNumber === 16 && numericValue != null && numericValue > 0) {
        lapMaxHeartRate = numericValue;
      } else if (field.fieldNumber === 2 && numericValue != null) {
        lapStartTimestampSeconds = numericValue + FIT_EPOCH_OFFSET_SECONDS;
      } else if (field.fieldNumber === 26 && numericValue != null) {
        lapType = mapFitLapTriggerToLapType(Math.round(numericValue));
      }
    }

    offset += field.size;
  }

  for (const developerField of definition.developerFields) {
    if (offset + developerField.size > dataEnd) {
      throw new Error('Invalid FIT file: unexpected end of developer data message.');
    }
    offset += developerField.size;
  }

  if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    state.points.push({
      lat,
      lon,
      elevationM,
      timestampSeconds,
      heartRate,
      distanceM,
    });
  }

  if (definition.globalMessageNumber === FIT_LAP_MESSAGE_NUMBER) {
    const hasDuration = lapDurationSeconds != null && lapDurationSeconds > 0;
    const hasDistance = lapDistanceM != null && lapDistanceM > 0;

    if (hasDuration || hasDistance) {
      const safeDistanceM = lapDistanceM != null && lapDistanceM > 0 ? lapDistanceM : 0;
      const safeDurationSeconds = hasDuration ? lapDurationSeconds : null;
      const derivedPaceSecondsPerKm =
        lapAvgSpeedMps != null && lapAvgSpeedMps > 0
          ? 1000 / lapAvgSpeedMps
          : safeDurationSeconds != null && safeDistanceM > 0
            ? safeDurationSeconds / (safeDistanceM / 1000)
            : null;

      state.fitCustomSplits.push({
        lapType,
        distanceM: safeDistanceM,
        durationSeconds: safeDurationSeconds,
        avgPaceSecondsPerKm: derivedPaceSecondsPerKm,
        avgHeartRate: lapAvgHeartRate,
        maxHeartRate: lapMaxHeartRate,
        startTimestampSeconds: lapStartTimestampSeconds,
      });
    }
  }

  return offset;
}

function parseFitDetailed(
  binary: Uint8Array,
  options?: ParseRouteFileOptions,
  filename = 'activity.fit',
): ParsedRouteImport {
  if (binary.byteLength < 12) {
    throw new Error('Invalid FIT file: header is too short.');
  }

  const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const headerSize = dataView.getUint8(0);

  if (headerSize < 12) {
    throw new Error('Invalid FIT file: header size is invalid.');
  }

  if (binary.byteLength < headerSize) {
    throw new Error('Invalid FIT file: truncated header.');
  }

  const fitSignature = String.fromCharCode(binary[8], binary[9], binary[10], binary[11]);
  if (fitSignature !== '.FIT') {
    throw new Error('Invalid FIT file: missing .FIT signature.');
  }

  const dataSize = dataView.getUint32(4, true);
  const dataStart = headerSize;
  const dataEnd = dataStart + dataSize;

  if (dataEnd > binary.byteLength) {
    throw new Error('Invalid FIT file: declared data size exceeds file length.');
  }

  const localDefinitions: Array<FitMessageDefinition | null> = Array.from(
    { length: FIT_LOCAL_MESSAGE_TYPES },
    () => null,
  );

  const state: FitParseState = {
    points: [],
    summaryOverrides: {},
    fitCustomSplits: [],
  };
  let canonical: CanonicalActivity | null = null;

  try {
    canonical = parseActivityFileToCanonical(binary, filename, options);
    state.summaryOverrides = mergeCanonicalSummary(state.summaryOverrides, canonical);
  } catch {
    canonical = null;
  }

  let offset = dataStart;

  while (offset < dataEnd) {
    const recordHeader = dataView.getUint8(offset);
    offset += 1;

    // Compressed timestamp data header.
    if ((recordHeader & 0x80) !== 0) {
      const localMessageType = (recordHeader >> 5) & 0x03;
      const definition = localDefinitions[localMessageType];

      if (!definition) {
        throw new Error('Invalid FIT file: data message without definition.');
      }

      offset = parseFitDataMessage(dataView, offset, dataEnd, definition, state);
      continue;
    }

    const isDefinitionMessage = (recordHeader & 0x40) !== 0;
    const localMessageType = recordHeader & 0x0f;

    if (localMessageType >= FIT_LOCAL_MESSAGE_TYPES) {
      throw new Error('Invalid FIT file: local message type out of range.');
    }

    if (isDefinitionMessage) {
      const { nextOffset, definition } = parseFitDefinitionMessage(dataView, offset, dataEnd, recordHeader);
      localDefinitions[localMessageType] = definition;
      offset = nextOffset;
      continue;
    }

    const definition = localDefinitions[localMessageType];
    if (!definition) {
      throw new Error('Invalid FIT file: data message without prior definition.');
    }

    offset = parseFitDataMessage(dataView, offset, dataEnd, definition, state);
  }

  return finaliseParsedRoute(
    {
      points: state.points,
      summaryOverrides: state.summaryOverrides,
      customSplits:
        state.fitCustomSplits.length > 0
          ? buildCustomSplitsFromFitLaps(state.fitCustomSplits, state.summaryOverrides)
          : canonical
            ? mapCanonicalLapsToRouteLaps(canonical)
            : [],
      heartRateZones: canonical?.heartRateZones.length ? canonical.heartRateZones : undefined,
    },
    options,
  );
}

/**
 * Parse a FIT binary file and return an encoded polyline.
 */
export function parseFit(binary: Uint8Array): string {
  return parseFitDetailed(binary).polyline;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entrypoints
// ─────────────────────────────────────────────────────────────────────────────

export function parseRouteFileWithSummary(
  content: string | Uint8Array,
  filename: string,
  options?: ParseRouteFileOptions,
): ParsedRouteImport {
  const format = detectFormat(filename);

  if (format === null) {
    throw new Error(
      `Unsupported file format: "${filename}". Please use .fit, .gpx, .tcx, .kml, .json, or a plain text polyline (.txt).`,
    );
  }

  switch (format) {
    case 'polyline': {
      if (typeof content !== 'string') {
        throw new Error('Polyline text file could not be read as text.');
      }
      return parsePolylineDetailed(content);
    }

    case 'gpx': {
      if (typeof content !== 'string') {
        throw new Error('GPX file could not be read as text.');
      }
      return parseGpxDetailed(content, options);
    }

    case 'tcx': {
      if (typeof content !== 'string') {
        throw new Error('TCX file could not be read as text.');
      }
      return parseTcxDetailed(content, options);
    }

    case 'fit': {
      if (typeof content === 'string') {
        throw new Error('FIT file must be read as binary data.');
      }
      return parseFitDetailed(content, options, filename);
    }

    case 'kml': {
      if (typeof content !== 'string') {
        throw new Error('KML file could not be read as text.');
      }
      return parseKmlDetailed(content, options);
    }

    case 'json': {
      if (typeof content !== 'string') {
        throw new Error('JSON file could not be read as text.');
      }
      return parseJsonDetailed(content, filename, options);
    }
  }
}

/**
 * Parse a route file and return a Google-encoded polyline string.
 */
export function parseRouteFile(
  content: string | Uint8Array,
  filename: string,
  options?: ParseRouteFileOptions,
): string {
  return parseRouteFileWithSummary(content, filename, options).polyline;
}

/**
 * Decode a stored polyline and return coordinates normalised to a [0,1] bounding box.
 * Useful for rendering an SVG route preview without a real map.
 *
 * @returns Array of {x, y} points in [0, 1] space, or empty array if input is invalid
 */
export function getNormalisedRoutePoints(encoded: string): { x: number; y: number }[] {
  if (!encoded) return [];

  let coords: LatLon[];
  try {
    coords = decodePolyline(encoded);
  } catch {
    return [];
  }

  if (coords.length === 0) return [];

  const lats = coords.map(c => c[0]);
  const lons = coords.map(c => c[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latRange = maxLat - minLat || 1;
  const lonRange = maxLon - minLon || 1;

  const range = Math.max(latRange, lonRange);

  return coords.map(([lat, lon]) => ({
    x: (lon - minLon) / range,
    y: 1 - (lat - minLat) / range,
  }));
}
