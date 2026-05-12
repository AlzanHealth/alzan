import { readFileSync } from 'fs';
import { join } from 'path';
import { strict as assert } from 'assert';
import { CanonicalActivityProvider } from './activity-import-canonical.types';
import {
  mapAppleHealthDailyActivityToCanonical,
  mapAppleHealthRecoveryToCanonical,
  mapAppleHealthSleepToCanonical,
} from './apple-health-health-canonical.mapper';
import {
  mapCorosDailyActivityToCanonical,
  mapCorosRecoveryToCanonical,
  mapCorosSleepToCanonical,
} from './coros-health-canonical.mapper';
import {
  mapFitbitDailyActivityToCanonical,
  mapFitbitRecoveryToCanonical,
  mapFitbitSleepToCanonical,
} from './fitbit-health-canonical.mapper';
import {
  mapGarminDailyActivityToCanonical,
  mapGarminRecoveryToCanonical,
  mapGarminSleepToCanonical,
} from './garmin-health-canonical.mapper';
import {
  mapHealthConnectDailyActivityToCanonical,
  mapHealthConnectRecoveryToCanonical,
  mapHealthConnectSleepToCanonical,
} from './health-connect-health-canonical.mapper';
import {
  mapOuraDailyActivityToCanonical,
  mapOuraRecoveryToCanonical,
  mapOuraSleepToCanonical,
} from './oura-health-canonical.mapper';
import {
  mapPolarDailyActivityToCanonical,
  mapPolarRecoveryToCanonical,
  mapPolarSleepToCanonical,
} from './polar-health-canonical.mapper';
import {
  mapSuuntoDailyActivityToCanonical,
  mapSuuntoRecoveryToCanonical,
  mapSuuntoSleepToCanonical,
} from './suunto-health-canonical.mapper';
import {
  mapUltrahumanDailyActivityToCanonical,
  mapUltrahumanMetabolicToCanonical,
  mapUltrahumanRecoveryToCanonical,
  mapUltrahumanSleepToCanonical,
} from './ultrahuman-health-canonical.mapper';
import {
  mapWhoopCycleToCanonical,
  mapWhoopRecoveryToCanonical,
  mapWhoopSleepToCanonical,
} from './whoop-health-canonical.mapper';

type HealthDomain = 'daily_activity' | 'sleep' | 'recovery' | 'cycle' | 'metabolic' | 'body_measurement';

type HealthSourceKind = 'real_public' | 'synthetic_official_shape' | 'user_redacted';

interface HealthFixtureEntry {
  id: string;
  provider: CanonicalActivityProvider;
  domain: HealthDomain;
  sourceKind: HealthSourceKind;
  sourceUrl: string | null;
  payload: unknown;
  expected: Record<string, unknown>;
  tolerance?: number;
  unsupported?: boolean;
  unsupportedReason?: string;
}

type HealthMapper = (payload: unknown) => Record<string, unknown>;

const fixtureRoot = join(__dirname, '..', '__fixtures__');

const healthMappers = new Map<string, HealthMapper>([
  [
    'apple_health:daily_activity',
    payload => mapAppleHealthDailyActivityToCanonical(payload) as unknown as Record<string, unknown>,
  ],
  ['apple_health:sleep', payload => mapAppleHealthSleepToCanonical(payload) as unknown as Record<string, unknown>],
  [
    'apple_health:recovery',
    payload => mapAppleHealthRecoveryToCanonical(payload) as unknown as Record<string, unknown>,
  ],
  [
    'coros:daily_activity',
    payload =>
      mapCorosDailyActivityToCanonical(payload as Record<string, unknown>) as unknown as Record<string, unknown>,
  ],
  [
    'coros:sleep',
    payload => mapCorosSleepToCanonical(payload as Record<string, unknown>) as unknown as Record<string, unknown>,
  ],
  [
    'coros:recovery',
    payload => mapCorosRecoveryToCanonical(payload as Record<string, unknown>) as unknown as Record<string, unknown>,
  ],
  [
    'fitbit:daily_activity',
    payload =>
      mapFitbitDailyActivityToCanonical(payload as Record<string, unknown>) as unknown as Record<string, unknown>,
  ],
  [
    'fitbit:sleep',
    payload => mapFitbitSleepToCanonical(payload as Record<string, unknown>) as unknown as Record<string, unknown>,
  ],
  [
    'fitbit:recovery',
    payload => mapFitbitRecoveryToCanonical(payload as Record<string, unknown>) as unknown as Record<string, unknown>,
  ],
  [
    'garmin:daily_activity',
    payload => mapGarminDailyActivityToCanonical(payload) as unknown as Record<string, unknown>,
  ],
  ['garmin:sleep', payload => mapGarminSleepToCanonical(payload) as unknown as Record<string, unknown>],
  ['garmin:recovery', payload => mapGarminRecoveryToCanonical(payload) as unknown as Record<string, unknown>],
  [
    'health_connect:daily_activity',
    payload => mapHealthConnectDailyActivityToCanonical(payload) as unknown as Record<string, unknown>,
  ],
  ['health_connect:sleep', payload => mapHealthConnectSleepToCanonical(payload) as unknown as Record<string, unknown>],
  [
    'health_connect:recovery',
    payload => mapHealthConnectRecoveryToCanonical(payload) as unknown as Record<string, unknown>,
  ],
  ['oura:daily_activity', payload => mapOuraDailyActivityToCanonical(payload) as unknown as Record<string, unknown>],
  ['oura:sleep', payload => mapOuraSleepToCanonical(payload) as unknown as Record<string, unknown>],
  ['oura:recovery', payload => mapOuraRecoveryToCanonical(payload) as unknown as Record<string, unknown>],
  ['polar:daily_activity', payload => mapPolarDailyActivityToCanonical(payload) as unknown as Record<string, unknown>],
  ['polar:sleep', payload => mapPolarSleepToCanonical(payload) as unknown as Record<string, unknown>],
  ['polar:recovery', payload => mapPolarRecoveryToCanonical(payload) as unknown as Record<string, unknown>],
  [
    'suunto:daily_activity',
    payload => mapSuuntoDailyActivityToCanonical(payload) as unknown as Record<string, unknown>,
  ],
  ['suunto:sleep', payload => mapSuuntoSleepToCanonical(payload) as unknown as Record<string, unknown>],
  ['suunto:recovery', payload => mapSuuntoRecoveryToCanonical(payload) as unknown as Record<string, unknown>],
  [
    'ultrahuman:daily_activity',
    payload => mapUltrahumanDailyActivityToCanonical(payload) as unknown as Record<string, unknown>,
  ],
  ['ultrahuman:sleep', payload => mapUltrahumanSleepToCanonical(payload) as unknown as Record<string, unknown>],
  ['ultrahuman:recovery', payload => mapUltrahumanRecoveryToCanonical(payload) as unknown as Record<string, unknown>],
  ['ultrahuman:metabolic', payload => mapUltrahumanMetabolicToCanonical(payload) as unknown as Record<string, unknown>],
  ['whoop:cycle', payload => mapWhoopCycleToCanonical(payload) as unknown as Record<string, unknown>],
  ['whoop:sleep', payload => mapWhoopSleepToCanonical(payload) as unknown as Record<string, unknown>],
  ['whoop:recovery', payload => mapWhoopRecoveryToCanonical(payload) as unknown as Record<string, unknown>],
]);

function readHealthFixtureManifest(): HealthFixtureEntry[] {
  const rawManifest = readFileSync(join(fixtureRoot, 'health-manifest.json'), 'utf8');
  return JSON.parse(rawManifest) as HealthFixtureEntry[];
}

function buildHealthContext(entry: HealthFixtureEntry, fieldPath: string): string {
  return `${entry.id} provider=${entry.provider} domain=${entry.domain} field=${fieldPath}`;
}

function buildMapperKey(entry: Pick<HealthFixtureEntry, 'provider' | 'domain'>): string {
  return `${entry.provider}:${entry.domain}`;
}

function assertExpectedFields(actual: Record<string, unknown>, entry: HealthFixtureEntry): void {
  for (const [key, expectedValue] of Object.entries(entry.expected)) {
    if (typeof actual[key] === 'number' && typeof expectedValue === 'number') {
      const tolerance = entry.tolerance ?? 0.000001;
      assert.ok(
        Math.abs(actual[key] - expectedValue) <= tolerance,
        `${buildHealthContext(entry, key)} expected=${expectedValue} actual=${actual[key]} tolerance=${tolerance}`,
      );
      continue;
    }
    assert.equal(actual[key], expectedValue, buildHealthContext(entry, key));
  }
}

function assertHealthFixture(entry: HealthFixtureEntry): void {
  assert.ok(entry.id.length > 0, 'health fixture id is required');
  if (entry.unsupported) {
    assert.ok(entry.unsupportedReason, buildHealthContext(entry, 'unsupportedReason'));
    assert.equal(healthMappers.has(buildMapperKey(entry)), false, buildHealthContext(entry, 'unsupported mapper'));
    return;
  }
  const mapper = healthMappers.get(buildMapperKey(entry));
  assert.ok(mapper, buildHealthContext(entry, 'mapper'));
  assertExpectedFields(mapper(entry.payload), entry);
}

function assertEveryMapperHasFixture(entries: HealthFixtureEntry[]): void {
  for (const mapperKey of healthMappers.keys()) {
    assert.ok(
      entries.some(entry => !entry.unsupported && buildMapperKey(entry) === mapperKey),
      `Missing health fixture for ${mapperKey}`,
    );
  }
}

function assertHealthManifestCoverage(): void {
  const fixtureFilter = process.env.ACTIVITY_IMPORT_FIXTURE_FILTER;
  const providerFilter = process.env.ACTIVITY_IMPORT_PROVIDER_FILTER;
  const kindFilter = process.env.ACTIVITY_IMPORT_KIND_FILTER;
  const entries = readHealthFixtureManifest().filter(entry => {
    if (fixtureFilter && entry.id !== fixtureFilter) return false;
    if (providerFilter && entry.provider !== providerFilter) return false;
    return true;
  });
  if (kindFilter === 'health' && (providerFilter || fixtureFilter)) {
    assert.ok(
      entries.length > 0,
      `No health fixture matched provider=${providerFilter ?? '*'} fixture=${fixtureFilter ?? '*'}`,
    );
  }
  if (!fixtureFilter && !providerFilter) {
    assertEveryMapperHasFixture(entries);
  }
  entries.forEach(assertHealthFixture);
}

assertHealthManifestCoverage();
