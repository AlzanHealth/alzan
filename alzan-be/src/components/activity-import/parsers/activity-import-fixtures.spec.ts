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
  expectedSummary: Partial<CanonicalActivity['summary']>;
  expectedStreams: Partial<Record<keyof CanonicalActivity['streams'], number>>;
  expectedProviderFields: Record<string, unknown>;
}

const fixtureRoot = join(__dirname, '..', '__fixtures__');

function readFixtureManifest(): FixtureManifestEntry[] {
  const rawManifest = readFileSync(join(fixtureRoot, 'manifest.json'), 'utf8');
  return JSON.parse(rawManifest) as FixtureManifestEntry[];
}

function readFixture(entry: FixtureManifestEntry): string {
  return readFileSync(join(fixtureRoot, entry.file), 'utf8');
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
  fixtureId: string,
): void {
  for (const [key, expectedValue] of Object.entries(expectedSummary)) {
    const actualValue = actualSummary[key as keyof CanonicalActivity['summary']];
    assert.equal(actualValue, expectedValue, `${fixtureId} summary.${key}`);
  }
}

function assertStreams(
  actualStreams: CanonicalActivity['streams'],
  expectedStreams: FixtureManifestEntry['expectedStreams'],
  fixtureId: string,
): void {
  for (const [key, expectedMinCount] of Object.entries(expectedStreams)) {
    const streamKey = key.replace('MinCount', '') as keyof CanonicalActivity['streams'];
    assert.ok(actualStreams[streamKey].length >= expectedMinCount, `${fixtureId} streams.${streamKey}`);
  }
}

function assertProviderFields(
  actualVendorFields: CanonicalActivity['vendorFields'],
  expectedProviderFields: Record<string, unknown>,
  fixtureId: string,
): void {
  for (const [key, expectedValue] of Object.entries(expectedProviderFields)) {
    assert.equal(actualVendorFields[key], expectedValue, `${fixtureId} vendorFields.${key}`);
  }
}

function assertCanonicalFixture(entry: FixtureManifestEntry): void {
  assertFixtureMetadata(entry);
  const canonical = parseActivityFileToCanonical(readFixture(entry), entry.file, { estimatedMaxHeartRate: 190 });

  assert.equal(canonical.provider, entry.provider, `${entry.id} provider`);
  assert.equal(canonical.sourceFileType, entry.format, `${entry.id} sourceFileType`);
  assert.equal(canonical.sportType, entry.sportType, `${entry.id} sportType`);
  assert.equal(canonical.sportSubtype, entry.sportSubtype, `${entry.id} sportSubtype`);
  assertSummary(canonical.summary, entry.expectedSummary, entry.id);
  assertStreams(canonical.streams, entry.expectedStreams, entry.id);
  assertProviderFields(canonical.vendorFields, entry.expectedProviderFields, entry.id);
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
    'other',
  ]);
  const actualProviders = new Set(entries.map(entry => entry.provider));

  for (const provider of expectedProviders) {
    assert.ok(actualProviders.has(provider), `Missing fixture for provider ${provider}`);
  }
}

function assertFixtureManifestCoverage(): void {
  const entries = readFixtureManifest();

  assertEveryAlzanSportIsCovered(entries);
  assertEveryWearableProviderIsCovered(entries);
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
