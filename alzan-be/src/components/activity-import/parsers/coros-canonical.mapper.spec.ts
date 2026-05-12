import { strict as assert } from 'assert';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import { parseCorosActivityFileToCanonical } from './coros-activity-canonical.mapper';
import {
  mapCorosDailyActivityToCanonical,
  mapCorosRecoveryToCanonical,
  mapCorosSleepToCanonical,
} from './coros-health-canonical.mapper';
import { parseRouteFileWithSummary } from './route-import.parser';
import { getDatabaseProviderForStrengthImport, parseStrengthActivityFile } from './strength-activity-import.parser';

const FIT_EPOCH_OFFSET_SECONDS = 631065600;

type FitFieldDefinition = {
  fieldNumber: number;
  size: number;
  baseType: number;
  value: number | number[];
};

function fitTimestamp(iso: string): number {
  return Math.round(new Date(iso).getTime() / 1000 - FIT_EPOCH_OFFSET_SECONDS);
}

function writeFitField(target: number[], field: FitFieldDefinition): void {
  const buffer = new ArrayBuffer(field.size);
  const view = new DataView(buffer);
  const values = Array.isArray(field.value) ? field.value : [field.value];
  const elementSize = field.baseType === 0x02 || field.baseType === 0x0d ? 1 : field.baseType === 0x84 ? 2 : 4;
  for (let index = 0; index < values.length; index += 1) {
    const offset = index * elementSize;
    if (offset + elementSize > field.size) break;
    const value = values[index];
    if (field.baseType === 0x02 || field.baseType === 0x0d) view.setUint8(offset, value);
    else if (field.baseType === 0x84) view.setUint16(offset, value, true);
    else if (field.baseType === 0x85) view.setInt32(offset, value, true);
    else if (field.baseType === 0x86) view.setUint32(offset, value, true);
  }
  target.push(...new Uint8Array(buffer));
}

function appendFitDefinition(
  target: number[],
  localMessageType: number,
  globalMessageNumber: number,
  fields: Array<Omit<FitFieldDefinition, 'value'>>,
): void {
  target.push(0x40 | localMessageType, 0, 0);
  target.push(globalMessageNumber & 0xff, (globalMessageNumber >> 8) & 0xff);
  target.push(fields.length);
  fields.forEach(field => target.push(field.fieldNumber, field.size, field.baseType));
}

function appendFitData(target: number[], localMessageType: number, fields: FitFieldDefinition[]): void {
  target.push(localMessageType);
  fields.forEach(field => writeFitField(target, field));
}

function semicircles(value: number): number {
  return Math.round((value * 2147483648) / 180);
}

function buildFit(): Uint8Array {
  const startedAt = fitTimestamp('2026-05-01T08:00:00Z');
  const data: number[] = [];
  const fileIdFields = [
    { fieldNumber: 1, size: 2, baseType: 0x84 },
    { fieldNumber: 2, size: 2, baseType: 0x84 },
  ];
  appendFitDefinition(data, 0, 0, fileIdFields);
  appendFitData(data, 0, [
    { ...fileIdFields[0], value: 1 },
    { ...fileIdFields[1], value: 1328 },
  ]);
  const sessionFields = [
    { fieldNumber: 2, size: 4, baseType: 0x86 },
    { fieldNumber: 5, size: 1, baseType: 0x02 },
    { fieldNumber: 6, size: 1, baseType: 0x02 },
    { fieldNumber: 7, size: 4, baseType: 0x86 },
    { fieldNumber: 8, size: 4, baseType: 0x86 },
    { fieldNumber: 9, size: 4, baseType: 0x86 },
    { fieldNumber: 11, size: 2, baseType: 0x84 },
    { fieldNumber: 16, size: 1, baseType: 0x02 },
    { fieldNumber: 17, size: 1, baseType: 0x02 },
    { fieldNumber: 253, size: 4, baseType: 0x86 },
  ];
  appendFitDefinition(data, 1, 18, sessionFields);
  appendFitData(data, 1, [
    { ...sessionFields[0], value: startedAt },
    { ...sessionFields[1], value: 1 },
    { ...sessionFields[2], value: 0 },
    { ...sessionFields[3], value: 120000 },
    { ...sessionFields[4], value: 120000 },
    { ...sessionFields[5], value: 15000 },
    { ...sessionFields[6], value: 100 },
    { ...sessionFields[7], value: 100 },
    { ...sessionFields[8], value: 104 },
    { ...sessionFields[9], value: startedAt + 120 },
  ]);
  const recordFields = [
    { fieldNumber: 0, size: 4, baseType: 0x85 },
    { fieldNumber: 1, size: 4, baseType: 0x85 },
    { fieldNumber: 3, size: 1, baseType: 0x02 },
    { fieldNumber: 5, size: 4, baseType: 0x86 },
    { fieldNumber: 253, size: 4, baseType: 0x86 },
  ];
  appendFitDefinition(data, 2, 20, recordFields);
  appendFitData(data, 2, [
    { ...recordFields[0], value: semicircles(40.4168) },
    { ...recordFields[1], value: semicircles(-3.7038) },
    { ...recordFields[2], value: 100 },
    { ...recordFields[3], value: 0 },
    { ...recordFields[4], value: startedAt },
  ]);
  appendFitData(data, 2, [
    { ...recordFields[0], value: semicircles(40.4178) },
    { ...recordFields[1], value: semicircles(-3.7048) },
    { ...recordFields[2], value: 104 },
    { ...recordFields[3], value: 15000 },
    { ...recordFields[4], value: startedAt + 120 },
  ]);
  const header = new Uint8Array(14);
  header[0] = 14;
  header[1] = 16;
  new DataView(header.buffer).setUint32(4, data.length, true);
  header[8] = '.'.charCodeAt(0);
  header[9] = 'F'.charCodeAt(0);
  header[10] = 'I'.charCodeAt(0);
  header[11] = 'T'.charCodeAt(0);
  const output = new Uint8Array(header.length + data.length);
  output.set(header, 0);
  output.set(data, header.length);
  return output;
}

function buildCorosWorkout(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    provider: 'coros',
    id: 'coros-test',
    activityType: 'Run',
    startTime: '2026-05-01T08:00:00Z',
    durationSeconds: 600,
    distanceM: 2200,
    calories: 180,
    avgHeartRate: 140,
    maxHeartRate: 172,
    route: [
      { elapsedSeconds: 0, latitude: 40.4168, longitude: -3.7038 },
      { elapsedSeconds: 600, latitude: 40.4188, longitude: -3.7058 },
    ],
    samples: [
      { offsetSeconds: 0, heartRate: 120, speed: 3.4, distance: 0, cadence: 160, power: 230 },
      { offsetSeconds: 300, heartRate: 145, speed: 3.7, distance: 1100, cadence: 170, power: 255 },
      { offsetSeconds: 600, heartRate: 172, speed: 3.8, distance: 2200, cadence: 174, power: 280 },
    ],
    laps: [{ type: 'auto', durationSeconds: 300, distanceM: 1100, avgHeartRate: 132 }],
    heart_rate_zones: [{ zone: 1, durationSeconds: 120 }],
    ...overrides,
  });
}

function assertCorosRunningJson(): void {
  const canonical = parseCorosActivityFileToCanonical(buildCorosWorkout(), 'coros-run.json');
  const parsed = parseRouteFileWithSummary(buildCorosWorkout(), 'coros-run.json');
  assert.equal(canonical.provider, 'coros');
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.summary.distanceM, 2200);
  assert.equal(canonical.streams.heartRate.length, 3);
  assert.equal(canonical.streams.power.length, 3);
  assert.equal(canonical.laps.length, 1);
  assert.equal(canonical.heartRateZones.length, 1);
  assert.ok(parsed.polyline.length > 0);
}

function assertCorosFitUsesCorosOnlyWithSignal(): void {
  const fit = buildFit();
  assert.equal(parseActivityFileToCanonical(fit, 'coros-run.fit').provider, 'coros');
  assert.notEqual(parseActivityFileToCanonical(fit, 'activity.fit').provider, 'coros');
}

function assertCorosSportsWithoutGps(): void {
  const cases = [
    ['Football', 'football'],
    ['Basketball', 'basketball'],
    ['Tennis', 'tennis'],
    ['Padel Indoor', 'padel'],
  ] as const;
  cases.forEach(([activityType, sportType]) => {
    const parsed = parseRouteFileWithSummary(
      buildCorosWorkout({ activityType, route: [], samples: [{ offsetSeconds: 0, heartRate: 120 }] }),
      `coros-${activityType}.json`,
    );
    assert.equal(parsed.polyline, '');
    assert.equal(parsed.summary.sportType, sportType);
  });
}

function assertCorosCyclingSwimmingWalkingStrength(): void {
  const cycling = parseCorosActivityFileToCanonical(
    buildCorosWorkout({ activityType: 'Gravel Bike', avgPower: 240, avgCadence: 88 }),
    'coros-bike.json',
  );
  assert.equal(cycling.sportType, 'cycling');
  assert.equal(cycling.summary.avgPowerW, 240);
  const swim = parseCorosActivityFileToCanonical(
    buildCorosWorkout({ activityType: 'Pool Swim', swimmingMetrics: { strokeCount: 420 } }),
    'coros-swim.json',
  );
  assert.equal(swim.sportSubtype, 'pool');
  assert.deepEqual(swim.vendorFields.swimmingMetrics, { strokeCount: 420 });
  const walking = parseCorosActivityFileToCanonical(buildCorosWorkout({ activityType: 'Walk' }), 'coros-walk.json');
  assert.equal(walking.sportType, 'other');
  assert.equal(walking.vendorFields.corosSport, 'Walk');
  const strength = parseStrengthActivityFile(
    buildCorosWorkout({ activityType: 'Strength Training', route: [], distanceM: null }),
    'coros-strength.json',
  );
  assert.equal(strength.provider, 'coros');
  assert.equal(getDatabaseProviderForStrengthImport(strength.provider), 'coros');
}

function assertCorosCalculatedZones(): void {
  const canonical = parseCorosActivityFileToCanonical(
    buildCorosWorkout({ heart_rate_zones: undefined }),
    'coros-zones.json',
    { estimatedMaxHeartRate: 190 },
  );
  assert.ok(canonical.heartRateZones.length > 0);
}

function assertCorosHealthMappers(): void {
  const daily = mapCorosDailyActivityToCanonical({ date: '2026-05-01', steps: 12000, calories: 2200 });
  assert.equal(daily.source, 'coros');
  assert.equal(daily.totalSteps, 12000);
  const sleep = mapCorosSleepToCanonical({
    date: '2026-05-01',
    startTime: '2026-05-01T22:00:00Z',
    endTime: '2026-05-02T06:00:00Z',
    stages: { deep: 80, light: 260, rem: 120, awake: 20 },
  });
  assert.equal(sleep.deepSleepMin, 80);
  const recovery = mapCorosRecoveryToCanonical({ date: '2026-05-01', recoveryScore: 82, hrvRmssd: 55 });
  assert.equal(recovery.recoveryScore, 82);
  assert.equal(recovery.hrvRmssdMs, 55);
}

assertCorosRunningJson();
assertCorosFitUsesCorosOnlyWithSignal();
assertCorosSportsWithoutGps();
assertCorosCyclingSwimmingWalkingStrength();
assertCorosCalculatedZones();
assertCorosHealthMappers();
