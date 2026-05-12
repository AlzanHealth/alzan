import { readFileSync } from 'fs';
import { join } from 'path';
import { strict as assert } from 'assert';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import { CanonicalActivity } from './activity-import-canonical.types';
import { parseStrengthActivityFile, STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG } from './strength-activity-import.parser';

type FixtureSourceKind = 'real_public' | 'synthetic_official_shape' | 'user_redacted';

interface FixtureManifestEntry {
  id: string;
  provider: CanonicalActivity['provider'];
  sportType: CanonicalActivity['sportType'];
  sportSubtype: CanonicalActivity['sportSubtype'];
  format: CanonicalActivity['sourceFileType'];
  file: string;
  sourceKind: FixtureSourceKind;
  sourceUrl: string | null;
  tolerance?: number;
  expectedSummary: Partial<CanonicalActivity['summary']>;
  expectedStreams: Partial<Record<keyof CanonicalActivity['streams'], number>>;
  expectedProviderFields: Record<string, unknown>;
  expectedDevice?: Partial<CanonicalActivity['device']>;
  expectedHeartRateZones?: CanonicalActivity['heartRateZones'];
  expectedLaps?: {
    exactCount?: number;
    items?: Array<Partial<CanonicalActivity['laps'][number]>>;
  };
  expectedRoute?: {
    positionExactCount?: number;
    positionMinCount?: number;
  };
}

const fixtureRoot = join(__dirname, '..', '__fixtures__');

function readFixtureManifest(): FixtureManifestEntry[] {
  const rawManifest = readFileSync(join(fixtureRoot, 'manifest.json'), 'utf8');
  return JSON.parse(rawManifest) as FixtureManifestEntry[];
}

function readFixture(entry: FixtureManifestEntry): string | Uint8Array {
  const fixturePath = join(fixtureRoot, entry.file);
  return entry.format === 'fit' ? Uint8Array.from(readFileSync(fixturePath)) : readFileSync(fixturePath, 'utf8');
}

function buildFixtureContext(entry: FixtureManifestEntry, fieldPath: string): string {
  return `${entry.id} provider=${entry.provider} sport=${entry.sportType} file=${entry.file} field=${fieldPath}`;
}

function assertFixtureValue(
  actualValue: unknown,
  expectedValue: unknown,
  entry: FixtureManifestEntry,
  fieldPath: string,
): void {
  if (typeof actualValue === 'number' && typeof expectedValue === 'number') {
    const tolerance = entry.tolerance ?? 0;
    assert.ok(
      Math.abs(actualValue - expectedValue) <= tolerance,
      `${buildFixtureContext(entry, fieldPath)} expected=${expectedValue} actual=${actualValue} tolerance=${tolerance}`,
    );
    return;
  }
  assert.equal(actualValue, expectedValue, buildFixtureContext(entry, fieldPath));
}

function assertFixtureMetadata(entry: FixtureManifestEntry): void {
  assert.ok(entry.id.length > 0, 'fixture id is required');
  assert.ok(entry.file.length > 0, `${entry.id} must reference a file`);
  assert.ok(
    entry.sourceKind === 'synthetic_official_shape' || entry.sourceUrl != null,
    `${entry.id} must include sourceUrl unless it is synthetic-only`,
  );
}

function assertSummary(
  actualSummary: CanonicalActivity['summary'],
  expectedSummary: Partial<CanonicalActivity['summary']>,
  entry: FixtureManifestEntry,
): void {
  for (const [key, expectedValue] of Object.entries(expectedSummary)) {
    const actualValue = actualSummary[key as keyof CanonicalActivity['summary']];
    assertFixtureValue(actualValue, expectedValue, entry, `summary.${key}`);
  }
}

function assertStreams(
  actualStreams: CanonicalActivity['streams'],
  expectedStreams: FixtureManifestEntry['expectedStreams'],
  entry: FixtureManifestEntry,
): void {
  for (const [key, expectedMinCount] of Object.entries(expectedStreams)) {
    const streamKey = key.replace('MinCount', '') as keyof CanonicalActivity['streams'];
    assert.ok(
      actualStreams[streamKey].length >= expectedMinCount,
      `${buildFixtureContext(entry, `streams.${streamKey}`)} expectedMin=${expectedMinCount} actual=${actualStreams[streamKey].length}`,
    );
  }
}

function assertProviderFields(
  actualVendorFields: CanonicalActivity['vendorFields'],
  expectedProviderFields: Record<string, unknown>,
  entry: FixtureManifestEntry,
): void {
  for (const [key, expectedValue] of Object.entries(expectedProviderFields)) {
    assertFixtureValue(actualVendorFields[key], expectedValue, entry, `vendorFields.${key}`);
  }
}

function assertDevice(canonical: CanonicalActivity, entry: FixtureManifestEntry): void {
  if (!entry.expectedDevice) return;
  for (const [key, expectedValue] of Object.entries(entry.expectedDevice)) {
    assertFixtureValue(
      canonical.device?.[key as keyof CanonicalActivity['device']] ?? null,
      expectedValue,
      entry,
      `device.${key}`,
    );
  }
}

function assertHeartRateZones(canonical: CanonicalActivity, entry: FixtureManifestEntry): void {
  if (!entry.expectedHeartRateZones) return;
  assert.equal(
    canonical.heartRateZones.length,
    entry.expectedHeartRateZones.length,
    buildFixtureContext(entry, 'heartRateZones.length'),
  );
  entry.expectedHeartRateZones.forEach((expectedZone, index) => {
    const actualZone = canonical.heartRateZones[index];
    assertFixtureValue(actualZone?.zone, expectedZone.zone, entry, `heartRateZones.${index}.zone`);
    assertFixtureValue(
      actualZone?.durationSeconds,
      expectedZone.durationSeconds,
      entry,
      `heartRateZones.${index}.durationSeconds`,
    );
    assertFixtureValue(actualZone?.percentage, expectedZone.percentage, entry, `heartRateZones.${index}.percentage`);
  });
}

function assertLaps(canonical: CanonicalActivity, entry: FixtureManifestEntry): void {
  if (!entry.expectedLaps) return;
  if (entry.expectedLaps.exactCount != null) {
    assert.equal(canonical.laps.length, entry.expectedLaps.exactCount, buildFixtureContext(entry, 'laps.length'));
  }
  entry.expectedLaps.items?.forEach((expectedLap, index) => {
    const lapIndex = expectedLap.lapIndex;
    const actualLap =
      typeof lapIndex === 'number' ? canonical.laps.find(lap => lap.lapIndex === lapIndex) : canonical.laps[index];
    const contextIndex = typeof lapIndex === 'number' ? `lapIndex=${lapIndex}` : `${index}`;
    assert.ok(actualLap, buildFixtureContext(entry, `laps.${contextIndex}`));
    for (const [key, expectedValue] of Object.entries(expectedLap)) {
      assertFixtureValue(
        actualLap[key as keyof CanonicalActivity['laps'][number]],
        expectedValue,
        entry,
        `laps.${contextIndex}.${key}`,
      );
    }
  });
}

function assertRoute(canonical: CanonicalActivity, entry: FixtureManifestEntry): void {
  if (!entry.expectedRoute) return;
  if (entry.expectedRoute.positionExactCount != null) {
    assert.equal(
      canonical.streams.position.length,
      entry.expectedRoute.positionExactCount,
      buildFixtureContext(entry, 'route.positionExactCount'),
    );
  }
  if (entry.expectedRoute.positionMinCount != null) {
    assert.ok(
      canonical.streams.position.length >= entry.expectedRoute.positionMinCount,
      `${buildFixtureContext(entry, 'route.positionMinCount')} expectedMin=${entry.expectedRoute.positionMinCount} actual=${canonical.streams.position.length}`,
    );
  }
}

function assertCanonicalFixture(entry: FixtureManifestEntry): void {
  assertFixtureMetadata(entry);
  const canonical = parseActivityFileToCanonical(readFixture(entry), entry.file, { estimatedMaxHeartRate: 190 });

  assert.equal(canonical.provider, entry.provider, `${entry.id} provider`);
  assert.equal(canonical.sourceFileType, entry.format, `${entry.id} sourceFileType`);
  assert.equal(canonical.sportType, entry.sportType, `${entry.id} sportType`);
  assert.equal(canonical.sportSubtype, entry.sportSubtype, `${entry.id} sportSubtype`);
  assertSummary(canonical.summary, entry.expectedSummary, entry);
  assertStreams(canonical.streams, entry.expectedStreams, entry);
  assertProviderFields(canonical.vendorFields, entry.expectedProviderFields, entry);
  assertDevice(canonical, entry);
  assertHeartRateZones(canonical, entry);
  assertLaps(canonical, entry);
  assertRoute(canonical, entry);
}

function assertEveryAlzanSportIsCovered(entries: FixtureManifestEntry[]): void {
  const expectedSports = new Set<CanonicalActivity['sportType']>([
    'running',
    'cycling',
    'swimming',
    'hiking',
    'football',
    'basketball',
    'tennis',
    'padel',
    'strength',
    'gym',
    'other',
  ]);
  const actualSports = new Set(entries.map(entry => entry.sportType));

  for (const sport of expectedSports) {
    assert.ok(actualSports.has(sport), `Missing fixture for sport ${sport}`);
  }
}

function assertEveryWearableProviderIsCovered(entries: FixtureManifestEntry[]): void {
  const expectedProviders = new Set<CanonicalActivity['provider']>([
    'garmin',
    'suunto',
    'polar',
    'strava',
    'fitbit',
    'whoop',
    'oura',
    'ultrahuman',
    'apple_health',
    'health_connect',
    'coros',
    'other',
  ]);
  const actualProviders = new Set(entries.map(entry => entry.provider));

  for (const provider of expectedProviders) {
    assert.ok(actualProviders.has(provider), `Missing fixture for provider ${provider}`);
  }
}

function assertFixtureManifestCoverage(): void {
  const fixtureFilter = process.env.ACTIVITY_IMPORT_FIXTURE_FILTER;
  const providerFilter = process.env.ACTIVITY_IMPORT_PROVIDER_FILTER;
  const kindFilter = process.env.ACTIVITY_IMPORT_KIND_FILTER;
  const entries = readFixtureManifest().filter(entry => {
    if (fixtureFilter && entry.id !== fixtureFilter) return false;
    if (providerFilter && entry.provider !== providerFilter) return false;
    return true;
  });

  if (providerFilter || (fixtureFilter && kindFilter === 'activity')) {
    assert.ok(
      entries.length > 0,
      `No activity fixture matched provider=${providerFilter ?? '*'} fixture=${fixtureFilter ?? '*'}`,
    );
  }

  if (!fixtureFilter && !providerFilter) {
    assertEveryAlzanSportIsCovered(entries);
    assertEveryWearableProviderIsCovered(entries);
  }
  entries.forEach(assertCanonicalFixture);
}

function assertStrengthImportKeepsSuuntoScale(): void {
  const rawJson = readFileSync(join(fixtureRoot, 'providers/suunto/strength.json'), 'utf8');
  const summary = parseStrengthActivityFile(rawJson, 'suunto-strength.json', { estimatedMaxHeartRate: 190 });

  assert.equal(summary.provider, 'suunto');
  assert.equal(summary.durationSeconds, 3882);
  assert.equal(summary.caloriesKcal, 347);
  assert.equal(summary.avgHeartRate, 83);
  assert.equal(summary.maxHeartRate, 112);
  assert.equal(summary.minHeartRate, 66);
  assert.equal(summary.totalSteps, 346);
  assert.equal(summary.recoveryTimeSeconds, 10800);
  assert.equal(summary.epoc, 4);
  assert.equal(summary.pte, 1.3);
  assert.equal(summary.tss, 34);
}

function assertStrengthImportRejectsEnduranceSuuntoFile(): void {
  const rawJson = readFileSync(join(fixtureRoot, 'providers/suunto/running.json'), 'utf8');

  assert.throws(
    () => parseStrengthActivityFile(rawJson, 'suunto-running.json'),
    error => error instanceof Error && error.message === STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG,
  );
}

assertFixtureManifestCoverage();
assertStrengthImportKeepsSuuntoScale();
assertStrengthImportRejectsEnduranceSuuntoFile();
