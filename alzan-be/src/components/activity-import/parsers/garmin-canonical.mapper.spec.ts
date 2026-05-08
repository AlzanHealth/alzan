import { strict as assert } from 'assert';
import { parseGarminActivityFileToCanonical } from './garmin-activity-canonical.mapper';
import {
  mapGarminDailyActivityToCanonical,
  mapGarminRecoveryToCanonical,
  mapGarminSleepToCanonical,
} from './garmin-health-canonical.mapper';
import { parseRouteFileWithSummary } from './route-import.parser';
import { parseStrengthActivityFile } from './strength-activity-import.parser';

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
    if (field.baseType === 0x02 || field.baseType === 0x0d) {
      view.setUint8(offset, value);
    } else if (field.baseType === 0x84) {
      view.setUint16(offset, value, true);
    } else if (field.baseType === 0x85) {
      view.setInt32(offset, value, true);
    } else if (field.baseType === 0x86) {
      view.setUint32(offset, value, true);
    } else {
      throw new Error(`Unsupported test FIT base type: ${field.baseType}`);
    }
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
  for (const field of fields) {
    target.push(field.fieldNumber, field.size, field.baseType);
  }
}

function appendFitData(target: number[], localMessageType: number, fields: FitFieldDefinition[]): void {
  target.push(localMessageType);
  for (const field of fields) {
    writeFitField(target, field);
  }
}

function semicircles(value: number): number {
  return Math.round((value * 2147483648) / 180);
}

function buildGarminFit(params: {
  sport: number;
  subSport: number;
  distanceM?: number;
  includeGps?: boolean;
  includeNativeZones?: boolean;
}): Uint8Array {
  const startedAt = fitTimestamp('2026-05-01T08:00:00Z');
  const data: number[] = [];
  const fileIdFields = [
    { fieldNumber: 1, size: 2, baseType: 0x84 },
    { fieldNumber: 2, size: 2, baseType: 0x84 },
    { fieldNumber: 3, size: 4, baseType: 0x86 },
  ];
  appendFitDefinition(data, 0, 0, fileIdFields);
  appendFitData(data, 0, [
    { ...fileIdFields[0], value: 1 },
    { ...fileIdFields[1], value: 1328 },
    { ...fileIdFields[2], value: 123456789 },
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
    { fieldNumber: 65, size: 20, baseType: 0x86 },
    { fieldNumber: 253, size: 4, baseType: 0x86 },
  ];
  appendFitDefinition(data, 1, 18, sessionFields);
  appendFitData(data, 1, [
    { ...sessionFields[0], value: startedAt },
    { ...sessionFields[1], value: params.sport },
    { ...sessionFields[2], value: params.subSport },
    { ...sessionFields[3], value: 120000 },
    { ...sessionFields[4], value: 120000 },
    { ...sessionFields[5], value: Math.round((params.distanceM ?? 0) * 100) },
    { ...sessionFields[6], value: 100 },
    { ...sessionFields[7], value: 100 },
    { ...sessionFields[8], value: 104 },
    { ...sessionFields[9], value: params.includeNativeZones ? [10000, 20000, 30000, 40000, 50000] : [0, 0, 0, 0, 0] },
    { ...sessionFields[10], value: startedAt + 120 },
  ]);

  const lapFields = [
    { fieldNumber: 2, size: 4, baseType: 0x86 },
    { fieldNumber: 8, size: 4, baseType: 0x86 },
    { fieldNumber: 9, size: 4, baseType: 0x86 },
    { fieldNumber: 15, size: 1, baseType: 0x02 },
    { fieldNumber: 16, size: 1, baseType: 0x02 },
    { fieldNumber: 26, size: 1, baseType: 0x02 },
  ];
  appendFitDefinition(data, 2, 19, lapFields);
  appendFitData(data, 2, [
    { ...lapFields[0], value: startedAt },
    { ...lapFields[1], value: 120000 },
    { ...lapFields[2], value: Math.round((params.distanceM ?? 0) * 100) },
    { ...lapFields[3], value: 100 },
    { ...lapFields[4], value: 104 },
    { ...lapFields[5], value: 2 },
  ]);

  const recordFields = params.includeGps
    ? [
        { fieldNumber: 0, size: 4, baseType: 0x85 },
        { fieldNumber: 1, size: 4, baseType: 0x85 },
        { fieldNumber: 3, size: 1, baseType: 0x02 },
        { fieldNumber: 5, size: 4, baseType: 0x86 },
        { fieldNumber: 253, size: 4, baseType: 0x86 },
      ]
    : [
        { fieldNumber: 3, size: 1, baseType: 0x02 },
        { fieldNumber: 253, size: 4, baseType: 0x86 },
      ];
  appendFitDefinition(data, 3, 20, recordFields);
  if (params.includeGps) {
    appendFitData(data, 3, [
      { ...recordFields[0], value: semicircles(40.4168) },
      { ...recordFields[1], value: semicircles(-3.7038) },
      { ...recordFields[2], value: 100 },
      { ...recordFields[3], value: 0 },
      { ...recordFields[4], value: startedAt },
    ]);
    appendFitData(data, 3, [
      { ...recordFields[0], value: semicircles(40.4178) },
      { ...recordFields[1], value: semicircles(-3.7048) },
      { ...recordFields[2], value: 104 },
      { ...recordFields[3], value: Math.round((params.distanceM ?? 150) * 100) },
      { ...recordFields[4], value: startedAt + 120 },
    ]);
  } else {
    appendFitData(data, 3, [
      { ...recordFields[0], value: 100 },
      { ...recordFields[1], value: startedAt },
    ]);
    appendFitData(data, 3, [
      { ...recordFields[0], value: 104 },
      { ...recordFields[1], value: startedAt + 120 },
    ]);
  }

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

function assertGarminRunningFitParsesAsRoute(): void {
  const fit = buildGarminFit({ sport: 1, subSport: 0, distanceM: 150, includeGps: true, includeNativeZones: true });
  const canonical = parseGarminActivityFileToCanonical(fit, 'garmin-run.fit', { estimatedMaxHeartRate: 200 });
  assert.equal(canonical.sportType, 'running');
  const parsed = parseRouteFileWithSummary(fit, 'garmin-run.fit', { estimatedMaxHeartRate: 200 });
  assert.ok(parsed.polyline.length > 0);
  assert.equal(parsed.summary.sportType, 'running');
  assert.equal(parsed.summary.distanceM, 150);
  assert.equal(parsed.details.heartRateZones.length, 5);
  assert.equal(parsed.details.heartRateZones[4].zone, 5);
}

function assertGarminFitCalculatesZonesWithoutNativeZones(): void {
  const fit = buildGarminFit({ sport: 1, subSport: 0, distanceM: 150, includeGps: true, includeNativeZones: false });
  const parsed = parseRouteFileWithSummary(fit, 'garmin-run.fit', { estimatedMaxHeartRate: 200 });
  assert.equal(parsed.details.heartRateZones.length, 1);
  assert.equal(parsed.details.heartRateZones[0].zone, 1);
  assert.equal(parsed.details.heartRateZones[0].percentage, 100);
}

function assertGarminPadelWithoutGpsDoesNotFail(): void {
  const fit = buildGarminFit({ sport: 64, subSport: 85, includeGps: false, includeNativeZones: false });
  const parsed = parseRouteFileWithSummary(fit, 'garmin-padel.fit', { estimatedMaxHeartRate: 200 });
  assert.equal(parsed.polyline, '');
  assert.equal(parsed.summary.sportType, 'padel');
  assert.equal(parsed.details.heartRateZones[0].zone, 1);
}

function assertGarminStrengthFitUsesGarminProvider(): void {
  const fit = buildGarminFit({ sport: 4, subSport: 20, includeGps: false, includeNativeZones: false });
  const summary = parseStrengthActivityFile(fit, 'activity.fit', { estimatedMaxHeartRate: 200 });
  assert.equal(summary.provider, 'garmin');
  assert.equal(summary.durationSeconds, 120);
  assert.equal(summary.heartRateZones[0].zone, 1);
}

function assertGarminJsonActivityDetailsParses(): void {
  const rawJson = JSON.stringify({
    Summary: {
      ActivityId: '10472655210',
      SummaryId: '10472655210-detail',
      StartTimeInSeconds: 1777622400,
      DurationInSeconds: 120,
      ActivityType: 'TENNIS',
      ActiveKilocalories: 100,
      DeviceName: 'Forerunner',
      AverageHeartRateInBeatsPerMinute: 110,
      MaxHeartRateInBeatsPerMinute: 130,
    },
    Samples: [
      { StartTimeInSeconds: 1777622400, HeartRate: 110 },
      { StartTimeInSeconds: 1777622520, HeartRate: 130 },
    ],
  });
  const canonical = parseGarminActivityFileToCanonical(rawJson, 'garmin.json', { estimatedMaxHeartRate: 200 });
  assert.equal(canonical.provider, 'garmin');
  assert.equal(canonical.sportType, 'tennis');
  assert.equal(canonical.summary.durationSeconds, 120);
  assert.equal(canonical.heartRateZones[0].zone, 1);
}

function assertGarminHealthParsesWithoutPersistence(): void {
  const daily = mapGarminDailyActivityToCanonical({
    CalendarDate: '2026-05-01',
    StartTimeInSeconds: 1777622400,
    Steps: 12345,
    ActiveKilocalories: 550,
    DistanceInMeters: 7800,
  });
  assert.equal(daily.source, 'garmin');
  assert.equal(daily.totalSteps, 12345);
  assert.equal(daily.caloriesKcal, 550);

  const sleep = mapGarminSleepToCanonical({
    SleepSummaryId: 'sleep-1',
    CalendarDate: '2026-05-01',
    StartTimeInSeconds: 1777593600,
    EndTimeInSeconds: 1777622400,
    TotalSleepDurationInSeconds: 25200,
    DeepSleepDurationInSeconds: 3600,
    SleepScore: 82,
    AvgHrv: 48,
    AverageSpO2: 96,
  });
  assert.equal(sleep.sourceSleepId, 'sleep-1');
  assert.equal(sleep.totalSleepMin, 420);
  assert.equal(sleep.deepSleepMin, 60);

  const recovery = mapGarminRecoveryToCanonical({
    CalendarDate: '2026-05-01',
    StartTimeInSeconds: 1777622400,
    BodyBatteryStart: 75,
    BodyBatteryMin: 30,
    BodyBatteryMax: 82,
    BodyBatteryEnd: 50,
    StressScore: 24,
  });
  assert.equal(recovery.source, 'garmin');
  assert.equal(recovery.bodyBatteryEnd, 50);
  assert.equal(recovery.stressState, 24);
}

assertGarminRunningFitParsesAsRoute();
assertGarminFitCalculatesZonesWithoutNativeZones();
assertGarminPadelWithoutGpsDoesNotFail();
assertGarminStrengthFitUsesGarminProvider();
assertGarminJsonActivityDetailsParses();
assertGarminHealthParsesWithoutPersistence();
