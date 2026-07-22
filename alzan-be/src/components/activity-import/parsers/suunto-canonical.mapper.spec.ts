import { strict as assert } from 'assert';
import {
  applySuuntoWorkoutSummaryTimeMetadata,
  mapSuuntoActivityToCanonicalSport,
  parseSuuntoActivityFileToCanonical,
} from './suunto-activity-canonical.mapper';
import { parseRouteFileWithSummary } from './route-import.parser';
import {
  mapSuuntoDailyActivityToCanonical,
  mapSuuntoRecoveryToCanonical,
  mapSuuntoSleepToCanonical,
} from './suunto-health-canonical.mapper';

const FIT_EPOCH_OFFSET_SECONDS = 631065600;

type FitFieldDefinition = {
  fieldNumber: number;
  size: number;
  baseType: number;
  value: number | number[];
};

type TestFitLap = {
  startOffsetSeconds: number;
  durationSeconds: number;
  distanceM: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  lapTrigger?: number;
  omitStartTimestamp?: boolean;
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

function buildTestFit(params: {
  sport: number;
  subSport: number;
  distanceM?: number;
  durationSeconds?: number;
  includeGps?: boolean;
  lapTrigger?: number;
  laps?: TestFitLap[];
  localOffsetMinutes?: number;
}): Uint8Array {
  const startedAt = fitTimestamp('2026-05-01T08:00:00Z');
  const durationSeconds = params.durationSeconds ?? 3600;
  const data: number[] = [];

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
    { fieldNumber: 22, size: 2, baseType: 0x84 },
    { fieldNumber: 23, size: 2, baseType: 0x84 },
    { fieldNumber: 65, size: 20, baseType: 0x86 },
    { fieldNumber: 253, size: 4, baseType: 0x86 },
  ];
  appendFitDefinition(data, 0, 18, sessionFields);
  appendFitData(data, 0, [
    { ...sessionFields[0], value: startedAt },
    { ...sessionFields[1], value: params.sport },
    { ...sessionFields[2], value: params.subSport },
    { ...sessionFields[3], value: Math.round(durationSeconds * 1000) },
    { ...sessionFields[4], value: Math.round(durationSeconds * 1000) },
    { ...sessionFields[5], value: Math.round((params.distanceM ?? 0) * 100) },
    { ...sessionFields[6], value: 500 },
    { ...sessionFields[7], value: 120 },
    { ...sessionFields[8], value: 150 },
    { ...sessionFields[9], value: 80 },
    { ...sessionFields[10], value: 70 },
    { ...sessionFields[11], value: [300000, 600000, 900000, 1200000, 600000] },
    { ...sessionFields[12], value: startedAt + durationSeconds },
  ]);

  if (params.localOffsetMinutes != null) {
    const activityFields = [{ fieldNumber: 5, size: 4, baseType: 0x86 }];
    appendFitDefinition(data, 3, 34, activityFields);
    appendFitData(data, 3, [
      {
        ...activityFields[0],
        value: startedAt + durationSeconds + params.localOffsetMinutes * 60,
      },
    ]);
  }

  const lapFields = [
    { fieldNumber: 2, size: 4, baseType: 0x86 },
    { fieldNumber: 8, size: 4, baseType: 0x86 },
    { fieldNumber: 9, size: 4, baseType: 0x86 },
    { fieldNumber: 15, size: 1, baseType: 0x02 },
    { fieldNumber: 16, size: 1, baseType: 0x02 },
    { fieldNumber: 24, size: 1, baseType: 0x02 },
  ];
  appendFitDefinition(data, 1, 19, lapFields);
  const laps: TestFitLap[] = params.laps ?? [
    {
      startOffsetSeconds: 0,
      durationSeconds,
      distanceM: params.distanceM ?? 0,
      avgHeartRate: 120,
      maxHeartRate: 150,
      lapTrigger: params.lapTrigger ?? 2,
    },
  ];
  for (const lap of laps) {
    appendFitData(data, 1, [
      { ...lapFields[0], value: lap.omitStartTimestamp ? 0 : startedAt + lap.startOffsetSeconds },
      { ...lapFields[1], value: Math.round(lap.durationSeconds * 1000) },
      { ...lapFields[2], value: Math.round(lap.distanceM * 100) },
      { ...lapFields[3], value: lap.avgHeartRate ?? 120 },
      { ...lapFields[4], value: lap.maxHeartRate ?? 150 },
      { ...lapFields[5], value: lap.lapTrigger ?? params.lapTrigger ?? 2 },
    ]);
  }

  if (params.includeGps) {
    const recordFields = [
      { fieldNumber: 0, size: 4, baseType: 0x85 },
      { fieldNumber: 1, size: 4, baseType: 0x85 },
      { fieldNumber: 2, size: 2, baseType: 0x84 },
      { fieldNumber: 3, size: 1, baseType: 0x02 },
      { fieldNumber: 5, size: 4, baseType: 0x86 },
      { fieldNumber: 253, size: 4, baseType: 0x86 },
    ];
    appendFitDefinition(data, 2, 20, recordFields);
    appendFitData(data, 2, [
      { ...recordFields[0], value: semicircles(40.4168) },
      { ...recordFields[1], value: semicircles(-3.7038) },
      { ...recordFields[2], value: (650 + 500) * 5 },
      { ...recordFields[3], value: 118 },
      { ...recordFields[4], value: 0 },
      { ...recordFields[5], value: startedAt },
    ]);
    appendFitData(data, 2, [
      { ...recordFields[0], value: semicircles(40.4178) },
      { ...recordFields[1], value: semicircles(-3.7048) },
      { ...recordFields[2], value: (660 + 500) * 5 },
      { ...recordFields[3], value: 122 },
      { ...recordFields[4], value: Math.round((params.distanceM ?? 150) * 100) },
      { ...recordFields[5], value: startedAt + 60 },
    ]);
  }

  const header = new Uint8Array(14);
  header[0] = 14;
  header[1] = 16;
  header[2] = 0;
  header[3] = 0;
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

function assertSuuntoSportMapping(): void {
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 1 }), {
    sportType: 'running',
    sportSubtype: 'outdoor',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 22 }), {
    sportType: 'trail',
    sportSubtype: 'trail_running',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 2 }), {
    sportType: 'cycling',
    sportSubtype: 'road',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 10 }), {
    sportType: 'cycling',
    sportSubtype: 'mtb',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 99 }), {
    sportType: 'cycling',
    sportSubtype: 'gravel',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ fitSport: 2, fitSubSport: 5 }), {
    sportType: 'cycling',
    sportSubtype: 'spinning',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ fitSport: 2, fitSubSport: 6 }), {
    sportType: 'cycling',
    sportSubtype: 'indoor_trainer',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ fitSport: 2, fitSubSport: 7 }), {
    sportType: 'cycling',
    sportSubtype: 'road',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ fitSport: 2, fitSubSport: 8 }), {
    sportType: 'cycling',
    sportSubtype: 'mtb',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 52 }), {
    sportType: 'cycling',
    sportSubtype: 'indoor_trainer',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 13 }), {
    sportType: 'skiing',
    sportSubtype: 'alpine',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 30 }), {
    sportType: 'snowboard',
    sportSubtype: 'slope',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 16 }), {
    sportType: 'golf',
    sportSubtype: null,
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 91 }), {
    sportType: 'surf',
    sportSubtype: 'surf',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 67 }), {
    sportType: 'football',
    sportSubtype: 'futsal',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 77 }), {
    sportType: 'martial_arts',
    sportSubtype: 'boxing',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ fitSport: 13 }), {
    sportType: 'skiing',
    sportSubtype: 'alpine',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ fitSport: 14, fitSubSport: 37 }), {
    sportType: 'snowboard',
    sportSubtype: 'splitboard',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 21 }), {
    sportType: 'swimming',
    sportSubtype: 'pool',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 33 }), {
    sportType: 'football',
    sportSubtype: 'football_11',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 34 }), {
    sportType: 'tennis',
    sportSubtype: 'outdoor',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 35 }), {
    sportType: 'basketball',
    sportSubtype: 'indoor',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 75 }), {
    sportType: 'padel',
    sportSubtype: 'outdoor',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ fitSport: 64, fitSubSport: 85 }), {
    sportType: 'padel',
    sportSubtype: 'outdoor',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ activityId: 104 }), {
    sportType: 'strength',
    sportSubtype: 'indoor',
  });
  assert.deepEqual(mapSuuntoActivityToCanonicalSport({ fitSport: 11 }), {
    sportType: 'hiking',
    sportSubtype: 'urban_walk',
  });
}

function assertSuuntoFitCanonicalParsesGpsAndLaps(): void {
  const fit = buildTestFit({ sport: 2, subSport: 0, distanceM: 1000, includeGps: true });
  const canonical = parseSuuntoActivityFileToCanonical(fit, 'suunto-cycling.fit', { estimatedMaxHeartRate: 190 });

  assert.equal(canonical.provider, 'suunto');
  assert.equal(canonical.sourceFileType, 'fit');
  assert.equal(canonical.sportType, 'cycling');
  assert.equal(canonical.summary.distanceM, 1000);
  assert.equal(canonical.summary.durationSeconds, 3600);
  assert.equal(canonical.summary.caloriesKcal, 500);
  assert.equal(canonical.summary.avgHeartRate, 120);
  assert.equal(canonical.summary.elevationGainM, 80);
  assert.equal(canonical.summary.elevationLossM, 70);
  assert.equal(canonical.streams.position.length, 2);
  assert.equal(canonical.streams.heartRate.length, 2);
  assert.equal(canonical.laps.length, 1);
  assert.equal(canonical.laps[0]?.lapType, 'distance');
  assert.deepEqual(canonical.heartRateZones, [
    { zone: 1, durationSeconds: 300, percentage: 8 },
    { zone: 2, durationSeconds: 600, percentage: 17 },
    { zone: 3, durationSeconds: 900, percentage: 25 },
    { zone: 4, durationSeconds: 1200, percentage: 33 },
    { zone: 5, durationSeconds: 600, percentage: 17 },
  ]);
}

function assertSuuntoFitMapsOfficialLapTriggers(): void {
  const expectations: Array<{ lapTrigger: number; expectedLapType: 'manual' | 'time' | 'distance' }> = [
    { lapTrigger: 0, expectedLapType: 'manual' },
    { lapTrigger: 1, expectedLapType: 'time' },
    { lapTrigger: 2, expectedLapType: 'distance' },
    { lapTrigger: 8, expectedLapType: 'manual' },
  ];

  for (const expectation of expectations) {
    const fit = buildTestFit({
      sport: 1,
      subSport: 0,
      distanceM: 500,
      durationSeconds: 120,
      lapTrigger: expectation.lapTrigger,
    });
    const canonical = parseSuuntoActivityFileToCanonical(fit, `suunto-trigger-${expectation.lapTrigger}.fit`);
    const routeImport = parseRouteFileWithSummary(fit, `suunto-trigger-${expectation.lapTrigger}.fit`);

    assert.equal(canonical.laps[0]?.lapType, expectation.expectedLapType);
    assert.equal(routeImport.details.customSplits[0]?.lapType, expectation.expectedLapType);
  }
}

function assertSuuntoFitRemovesMixedOneKilometerAutolaps(): void {
  const fit = buildTestFit({
    sport: 1,
    subSport: 0,
    distanceM: 4144,
    durationSeconds: 2110,
    laps: [
      { startOffsetSeconds: 0, durationSeconds: 342, distanceM: 1000, avgHeartRate: 141, lapTrigger: 0 },
      { startOffsetSeconds: 0, durationSeconds: 600, distanceM: 1600, avgHeartRate: 146, lapTrigger: 0 },
      { startOffsetSeconds: 600, durationSeconds: 364, distanceM: 1000, avgHeartRate: 152, lapTrigger: 0 },
      { startOffsetSeconds: 600, durationSeconds: 105, distanceM: 400, avgHeartRate: 153, lapTrigger: 0 },
      { startOffsetSeconds: 705, durationSeconds: 90, distanceM: 123, avgHeartRate: 150, lapTrigger: 0 },
      { startOffsetSeconds: 795, durationSeconds: 109, distanceM: 400, avgHeartRate: 153, lapTrigger: 0 },
      { startOffsetSeconds: 904, durationSeconds: 90, distanceM: 121, avgHeartRate: 157, lapTrigger: 0 },
      { startOffsetSeconds: 994, durationSeconds: 103, distanceM: 400, avgHeartRate: 160, lapTrigger: 0 },
    ],
  });

  const canonical = parseSuuntoActivityFileToCanonical(fit, 'suunto-running-intervals.fit');

  assert.deepEqual(
    canonical.laps.map(lap => Math.round(lap.distanceM ?? 0)),
    [1600, 400, 123, 400, 121, 400],
  );
  assert.deepEqual(
    canonical.laps.map(lap => lap.lapIndex),
    [1, 2, 3, 4, 5, 6],
  );
}

function assertSuuntoFitKeepsFifteenStructuredIntervals(): void {
  const fit = buildTestFit({
    sport: 1,
    subSport: 0,
    distanceM: 8350,
    durationSeconds: 2475,
    laps: [
      { startOffsetSeconds: 0, durationSeconds: 600, distanceM: 1600, avgHeartRate: 146, lapTrigger: 0 },
      { startOffsetSeconds: 0, durationSeconds: 342, distanceM: 1000, avgHeartRate: 141, lapTrigger: 0 },
      { startOffsetSeconds: 600, durationSeconds: 105.3, distanceM: 400, avgHeartRate: 153, lapTrigger: 0 },
      { startOffsetSeconds: 705.3, durationSeconds: 90, distanceM: 123, avgHeartRate: 150, lapTrigger: 0 },
      { startOffsetSeconds: 795.3, durationSeconds: 109.2, distanceM: 400, avgHeartRate: 153, lapTrigger: 0 },
      { startOffsetSeconds: 904.5, durationSeconds: 90, distanceM: 121, avgHeartRate: 157, lapTrigger: 0 },
      { startOffsetSeconds: 994.5, durationSeconds: 103, distanceM: 400, avgHeartRate: 160, lapTrigger: 0 },
      { startOffsetSeconds: 1097.5, durationSeconds: 90, distanceM: 130, avgHeartRate: 156, lapTrigger: 0 },
      { startOffsetSeconds: 1187.5, durationSeconds: 106.6, distanceM: 400, avgHeartRate: 161, lapTrigger: 0 },
      { startOffsetSeconds: 1294.1, durationSeconds: 90, distanceM: 136, avgHeartRate: 156, lapTrigger: 0 },
      { startOffsetSeconds: 1384.1, durationSeconds: 107.8, distanceM: 400, avgHeartRate: 161, lapTrigger: 0 },
      { startOffsetSeconds: 1491.9, durationSeconds: 90, distanceM: 144, avgHeartRate: 155, lapTrigger: 0 },
      { startOffsetSeconds: 1581.9, durationSeconds: 99.7, distanceM: 400, avgHeartRate: 164, lapTrigger: 0 },
      { startOffsetSeconds: 1681.6, durationSeconds: 90, distanceM: 121, avgHeartRate: 159, lapTrigger: 0 },
      { startOffsetSeconds: 1771.6, durationSeconds: 600, distanceM: 1600, avgHeartRate: 169, lapTrigger: 0 },
      { startOffsetSeconds: 2371.6, durationSeconds: 103.3, distanceM: 304, avgHeartRate: 176, lapTrigger: 0 },
      { startOffsetSeconds: 1681.6, durationSeconds: 193.3, distanceM: 425, avgHeartRate: 165, lapTrigger: 0 },
    ],
  });

  const canonical = parseSuuntoActivityFileToCanonical(fit, 'suunto-running-fifteen-intervals.fit');

  assert.deepEqual(
    canonical.laps.map(lap => Math.round(lap.distanceM ?? 0)),
    [1600, 400, 123, 400, 121, 400, 130, 400, 136, 400, 144, 400, 121, 1600, 304],
  );
}

function assertSuuntoFitKeepsRepeatedUntimedRecoveries(): void {
  const fit = buildTestFit({
    sport: 1,
    subSport: 0,
    distanceM: 2700,
    durationSeconds: 1260,
    laps: [
      { startOffsetSeconds: 0, durationSeconds: 600, distanceM: 1600, avgHeartRate: 146, lapTrigger: 0 },
      {
        startOffsetSeconds: 600,
        durationSeconds: 90,
        distanceM: 121,
        avgHeartRate: 157,
        lapTrigger: 0,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 690,
        durationSeconds: 100,
        distanceM: 400,
        avgHeartRate: 164,
        lapTrigger: 0,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 790,
        durationSeconds: 90,
        distanceM: 121,
        avgHeartRate: 159,
        lapTrigger: 0,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 880,
        durationSeconds: 103,
        distanceM: 304,
        avgHeartRate: 176,
        lapTrigger: 0,
        omitStartTimestamp: true,
      },
    ],
  });

  const canonical = parseSuuntoActivityFileToCanonical(fit, 'suunto-repeated-untimed-recoveries.fit');

  assert.deepEqual(
    canonical.laps.map(lap => Math.round(lap.distanceM ?? 0)),
    [1600, 121, 400, 121, 304],
  );
}

function assertSuuntoFitKeepsRealOneKilometerIntervals(): void {
  const fit = buildTestFit({
    sport: 1,
    subSport: 0,
    distanceM: 3400,
    durationSeconds: 1143,
    laps: [
      { startOffsetSeconds: 0, durationSeconds: 240, distanceM: 1000, avgHeartRate: 160, lapTrigger: 8 },
      { startOffsetSeconds: 240, durationSeconds: 90, distanceM: 200, avgHeartRate: 145, lapTrigger: 8 },
      { startOffsetSeconds: 330, durationSeconds: 242, distanceM: 1000, avgHeartRate: 164, lapTrigger: 8 },
      { startOffsetSeconds: 572, durationSeconds: 90, distanceM: 200, avgHeartRate: 146, lapTrigger: 8 },
      { startOffsetSeconds: 662, durationSeconds: 241, distanceM: 1000, avgHeartRate: 166, lapTrigger: 8 },
    ],
  });

  const canonical = parseSuuntoActivityFileToCanonical(fit, 'suunto-one-km-intervals.fit');

  assert.deepEqual(
    canonical.laps.map(lap => Math.round(lap.distanceM ?? 0)),
    [1000, 200, 1000, 200, 1000],
  );
}

function assertSuuntoFitKeepsNativeKilometersAndRecoveries(): void {
  const fit = buildTestFit({
    sport: 1,
    subSport: 0,
    distanceM: 7740,
    durationSeconds: 2850,
    laps: [
      {
        startOffsetSeconds: 0,
        durationSeconds: 397,
        distanceM: 1000,
        avgHeartRate: 136,
        lapTrigger: 2,
        omitStartTimestamp: true,
      },
      { startOffsetSeconds: 0, durationSeconds: 600, distanceM: 1480, avgHeartRate: 141, lapTrigger: 8 },
      {
        startOffsetSeconds: 600,
        durationSeconds: 363,
        distanceM: 1000,
        avgHeartRate: 150,
        lapTrigger: 2,
        omitStartTimestamp: true,
      },
      { startOffsetSeconds: 600, durationSeconds: 294.4, distanceM: 1000, avgHeartRate: 157, lapTrigger: 8 },
      { startOffsetSeconds: 894.4, durationSeconds: 120, distanceM: 190, avgHeartRate: 142, lapTrigger: 8 },
      {
        startOffsetSeconds: 1014.4,
        durationSeconds: 352.1,
        distanceM: 1000,
        avgHeartRate: 152,
        lapTrigger: 2,
        omitStartTimestamp: true,
      },
      { startOffsetSeconds: 1014.4, durationSeconds: 284.4, distanceM: 1000, avgHeartRate: 160, lapTrigger: 8 },
      { startOffsetSeconds: 1298.8, durationSeconds: 120, distanceM: 163, avgHeartRate: 150, lapTrigger: 8 },
      {
        startOffsetSeconds: 1418.8,
        durationSeconds: 361.2,
        distanceM: 1000,
        avgHeartRate: 158,
        lapTrigger: 2,
        omitStartTimestamp: true,
      },
      { startOffsetSeconds: 1418.8, durationSeconds: 286.7, distanceM: 1000, avgHeartRate: 166, lapTrigger: 8 },
      { startOffsetSeconds: 1705.5, durationSeconds: 120, distanceM: 173, avgHeartRate: 154, lapTrigger: 8 },
      {
        startOffsetSeconds: 1825.5,
        durationSeconds: 346.8,
        distanceM: 1000,
        avgHeartRate: 166,
        lapTrigger: 2,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 1825.5,
        durationSeconds: 292.7,
        distanceM: 1000,
        avgHeartRate: 169,
        lapTrigger: 2,
        omitStartTimestamp: true,
      },
      { startOffsetSeconds: 1825.5, durationSeconds: 289.6, distanceM: 1000, avgHeartRate: 169, lapTrigger: 8 },
      { startOffsetSeconds: 2115.1, durationSeconds: 120, distanceM: 171, avgHeartRate: 152, lapTrigger: 8 },
      { startOffsetSeconds: 2235.1, durationSeconds: 600, distanceM: 1530, avgHeartRate: 161, lapTrigger: 8 },
      { startOffsetSeconds: 2835.1, durationSeconds: 13.6, distanceM: 36, avgHeartRate: 165, lapTrigger: 8 },
      {
        startOffsetSeconds: 0,
        durationSeconds: 309.3,
        distanceM: 739,
        avgHeartRate: 163,
        lapTrigger: 2,
        omitStartTimestamp: true,
      },
    ],
  });

  const canonical = parseSuuntoActivityFileToCanonical(fit, 'suunto-native-series-with-recoveries.fit');

  assert.equal(canonical.summary.distanceM, 7740);
  assert.equal(canonical.laps.length, 11);
  assert.deepEqual(
    canonical.laps.map(lap => Math.round(lap.distanceM ?? 0)),
    [1480, 1000, 190, 1000, 163, 1000, 173, 1000, 171, 1530, 36],
  );
}

function assertSuuntoExactWorkoutFitKeepsElevenNativeLapsWithoutTriggers(): void {
  const fit = buildTestFit({
    sport: 1,
    subSport: 0,
    distanceM: 7739,
    durationSeconds: 2850,
    laps: [
      {
        startOffsetSeconds: 0,
        durationSeconds: 600,
        distanceM: 1477.4,
        avgHeartRate: 141,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 600,
        durationSeconds: 294.4,
        distanceM: 1000,
        avgHeartRate: 157,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 894.4,
        durationSeconds: 120,
        distanceM: 190.1,
        avgHeartRate: 142,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 1014.4,
        durationSeconds: 284.4,
        distanceM: 1000,
        avgHeartRate: 160,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 1298.8,
        durationSeconds: 120,
        distanceM: 163.1,
        avgHeartRate: 150,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 1418.8,
        durationSeconds: 286.7,
        distanceM: 1000,
        avgHeartRate: 166,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 1705.5,
        durationSeconds: 120,
        distanceM: 173.1,
        avgHeartRate: 154,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 1825.5,
        durationSeconds: 289.6,
        distanceM: 1000,
        avgHeartRate: 169,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 2115.1,
        durationSeconds: 120,
        distanceM: 171,
        avgHeartRate: 152,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 2235.1,
        durationSeconds: 600,
        distanceM: 1525.9,
        avgHeartRate: 161,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
      {
        startOffsetSeconds: 2835.1,
        durationSeconds: 13.6,
        distanceM: 36,
        avgHeartRate: 165,
        lapTrigger: 255,
        omitStartTimestamp: true,
      },
    ],
  });

  const canonical = parseSuuntoActivityFileToCanonical(fit, 'suunto-6a5fc13f4fd25d7c1b84b81c.fit');

  assert.equal(canonical.summary.distanceM, 7739);
  assert.equal(canonical.summary.durationSeconds, 2850);
  assert.equal(canonical.laps.length, 11);
  assert.ok(canonical.laps.every(lap => lap.lapType === 'unknown'));
  assert.ok(canonical.laps.every(lap => lap.startOffsetSeconds == null && lap.endOffsetSeconds == null));
  assert.deepEqual(
    canonical.laps.map(lap => Math.round(lap.distanceM ?? 0)),
    [1477, 1000, 190, 1000, 163, 1000, 173, 1000, 171, 1526, 36],
  );
}

function assertSuuntoFitKeepsOneKilometerAutolapsWhenNoStructuredPartialsExist(): void {
  const fit = buildTestFit({
    sport: 1,
    subSport: 0,
    distanceM: 3000,
    durationSeconds: 900,
    laps: [
      { startOffsetSeconds: 0, durationSeconds: 300, distanceM: 1000, avgHeartRate: 145, lapTrigger: 2 },
      { startOffsetSeconds: 300, durationSeconds: 301, distanceM: 1000, avgHeartRate: 148, lapTrigger: 2 },
      { startOffsetSeconds: 601, durationSeconds: 299, distanceM: 1000, avgHeartRate: 150, lapTrigger: 2 },
    ],
  });

  const canonical = parseSuuntoActivityFileToCanonical(fit, 'suunto-steady-one-km-autolaps.fit');

  assert.deepEqual(
    canonical.laps.map(lap => Math.round(lap.distanceM ?? 0)),
    [1000, 1000, 1000],
  );
}

function assertSuuntoFitAcceptsLeadingBytesBeforeHeader(): void {
  const fit = buildTestFit({ sport: 2, subSport: 0, distanceM: 1000, includeGps: true });
  const prefixed = new Uint8Array(fit.byteLength + 1);
  prefixed[0] = 0x0a;
  prefixed.set(fit, 1);

  const canonical = parseSuuntoActivityFileToCanonical(prefixed, 'suunto-prefixed.fit');

  assert.equal(canonical.sportType, 'cycling');
  assert.equal(canonical.summary.distanceM, 1000);
}

function assertSuuntoFitCanonicalParsesWithoutGps(): void {
  const fit = buildTestFit({ sport: 10, subSport: 20, distanceM: 0, includeGps: false });
  const canonical = parseSuuntoActivityFileToCanonical(fit, 'suunto-gym.fit', { estimatedMaxHeartRate: 190 });

  assert.equal(canonical.sportType, 'strength');
  assert.equal(canonical.sportSubtype, 'indoor');
  assert.equal(canonical.streams.position.length, 0);
  assert.equal(canonical.summary.durationSeconds, 3600);
  assert.equal(canonical.summary.caloriesKcal, 500);
}

function assertSuuntoFitCanonicalPreservesOriginalLocalTime(): void {
  const fit = buildTestFit({
    sport: 1,
    subSport: 0,
    distanceM: 5000,
    localOffsetMinutes: 120,
  });
  const canonical = parseSuuntoActivityFileToCanonical(fit, 'suunto-local-time.fit');

  assert.equal(canonical.summary.timezone, '+02:00');
  assert.equal(canonical.summary.startedAtLocal, '2026-05-01T10:00:00');
  assert.equal(canonical.summary.endedAtLocal, '2026-05-01T11:00:00');
}

function assertSuuntoSummaryOffsetOverridesFitFallback(): void {
  const canonical = parseSuuntoActivityFileToCanonical(
    buildTestFit({ sport: 1, subSport: 0, distanceM: 5000 }),
    'suunto-summary-offset.fit',
  );
  const enriched = applySuuntoWorkoutSummaryTimeMetadata(canonical, { timeOffsetInMinutes: -210 });

  assert.equal(enriched.summary.timezone, '-03:30');
  assert.equal(enriched.summary.startedAtLocal, '2026-05-01T04:30:00');
  assert.equal(enriched.summary.endedAtLocal, '2026-05-01T05:30:00');
}

function assertSuuntoFitWithoutGpsStillParsesAsRouteImport(): void {
  const fit = buildTestFit({ sport: 64, subSport: 85, distanceM: 0, includeGps: false });
  const routeImport = parseRouteFileWithSummary(fit, 'suunto-padel.fit', { estimatedMaxHeartRate: 190 });

  assert.equal(routeImport.polyline, '');
  assert.equal(routeImport.summary.sportType, 'padel');
  assert.equal(routeImport.summary.durationSeconds, 3600);
  assert.equal(routeImport.details.customSplits[0]?.lapType, 'distance');
  assert.deepEqual(routeImport.details.heartRateZones, [
    { zone: 1, durationSeconds: 300, percentage: 8 },
    { zone: 2, durationSeconds: 600, percentage: 17 },
    { zone: 3, durationSeconds: 900, percentage: 25 },
    { zone: 4, durationSeconds: 1200, percentage: 33 },
    { zone: 5, durationSeconds: 600, percentage: 17 },
  ]);
}

function assertSuuntoJsonCanonicalParsesSummary(): void {
  const rawJson = JSON.stringify({
    DeviceLog: {
      Header: {
        ActivityType: 11,
        DateTime: '2026-05-01T08:00:00Z',
        Duration: 3600,
        Distance: 6000,
        Energy: 418400,
        AverageHeartRate: 1.8,
        MaxHeartRate: 150,
        Ascent: 400,
        Descent: 390,
        StepCount: 7500,
      },
      Samples: [
        { TimeISO8601: '2026-05-01T08:00:00Z', Latitude: 0.7054, Longitude: -0.0646, HR: 1.8 },
        { TimeISO8601: '2026-05-01T08:01:00Z', Latitude: 0.7055, Longitude: -0.0647, HR: 110 },
      ],
    },
  });

  const canonical = parseSuuntoActivityFileToCanonical(rawJson, 'suunto-hiking.json');

  assert.equal(canonical.sportType, 'hiking');
  assert.equal(canonical.sportSubtype, 'trail');
  assert.equal(canonical.summary.caloriesKcal, 100);
  assert.equal(canonical.summary.avgHeartRate, 108);
  assert.equal(canonical.summary.totalSteps, 7500);
  assert.equal(canonical.streams.position.length, 2);
}

function assertSuuntoJsonCanonicalUsesHeaderActivityNameFallbacks(): void {
  const rawJson = JSON.stringify({
    DeviceLog: {
      Header: {
        Activity: 'Running',
        ActivityType: 3,
        DateTime: '2026-05-09T17:29:52Z',
        Duration: 2638.264,
        Distance: 8023,
        Energy: 3698619,
        TraingingLoadPeak: 172.7,
      },
      Samples: [],
      Windows: [
        {
          Window: {
            Type: 'Autolap',
            Distance: 1000,
            Duration: 316.7,
            HR: [{ Avg: 2.271, Max: 2.467, Min: 1.45 }],
          },
        },
        {
          Window: {
            Type: 'Autolap',
            Distance: 1000,
            Duration: 318.2,
            HR: [{ Avg: 2.657, Max: 2.783, Min: 2.467 }],
          },
        },
        {
          Window: {
            Type: 'Autolap',
            Distance: 1000,
            Duration: 321.9,
            HR: [{ Avg: 2.738, Max: 2.817, Min: 2.533 }],
          },
        },
      ],
    },
  });

  const canonical = parseSuuntoActivityFileToCanonical(rawJson, 'suunto-running-export.json');

  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'outdoor');
  assert.equal(canonical.summary.durationSeconds, 2638);
  assert.equal(canonical.summary.distanceM, 8023);
  assert.equal(canonical.summary.caloriesKcal, 884);
  assert.equal(canonical.summary.tss, 172.7);
  assert.equal(canonical.laps.length, 3);
  assert.equal(canonical.laps[2]?.distanceM, 1000);
  assert.equal(canonical.laps[2]?.durationSeconds, 321.9);
  assert.equal(canonical.laps[2]?.avgPaceSecondsPerKm, 321.9);
}

function assertSuuntoHealthCanonicalParsesWithoutPersistence(): void {
  const dailyActivity = mapSuuntoDailyActivityToCanonical({
    timestamp: '2026-05-01T12:00:00.000+02:00',
    entryData: {
      StepCount: 9000,
      EnergyConsumption: 2400,
      Distance: 6800,
    },
  });
  assert.equal(dailyActivity.source, 'suunto');
  assert.equal(dailyActivity.totalSteps, 9000);
  assert.equal(dailyActivity.caloriesKcal, 2400);
  assert.equal(dailyActivity.distanceM, 6800);

  const sleep = mapSuuntoSleepToCanonical({
    timestamp: '2026-05-01T23:00:00.000+02:00',
    entryData: {
      SleepId: 'sleep-1',
      BedtimeStart: '2026-05-01T23:00:00.000+02:00',
      BedtimeEnd: '2026-05-02T07:00:00.000+02:00',
      TotalSleepDuration: 25200,
      DeepSleepDuration: 5400,
      LightSleepDuration: 12600,
      RemSleepDuration: 5400,
      AwakeDuration: 1800,
      AvgHRV: 47,
      AvgHeartRate: 52,
      MaxSpo2: 98,
      IsNap: false,
    },
  });
  assert.equal(sleep.source, 'suunto');
  assert.equal(sleep.sourceSleepId, 'sleep-1');
  assert.equal(sleep.totalSleepMin, 420);
  assert.equal(sleep.deepSleepMin, 90);
  assert.equal(sleep.avgHrvMs, 47);
  assert.equal(sleep.avgSpo2Pct, 98);

  const recovery = mapSuuntoRecoveryToCanonical({
    timestamp: '2026-05-02T07:00:00.000+02:00',
    entryData: {
      Balance: 0.93,
      StressState: 3,
    },
  });
  assert.equal(recovery.source, 'suunto');
  assert.equal(recovery.balance, 0.93);
  assert.equal(recovery.stressState, 3);
}

assertSuuntoSportMapping();
assertSuuntoFitCanonicalParsesGpsAndLaps();
assertSuuntoFitMapsOfficialLapTriggers();
assertSuuntoFitRemovesMixedOneKilometerAutolaps();
assertSuuntoFitKeepsFifteenStructuredIntervals();
assertSuuntoFitKeepsRepeatedUntimedRecoveries();
assertSuuntoFitKeepsRealOneKilometerIntervals();
assertSuuntoFitKeepsNativeKilometersAndRecoveries();
assertSuuntoExactWorkoutFitKeepsElevenNativeLapsWithoutTriggers();
assertSuuntoFitKeepsOneKilometerAutolapsWhenNoStructuredPartialsExist();
assertSuuntoFitAcceptsLeadingBytesBeforeHeader();
assertSuuntoFitCanonicalParsesWithoutGps();
assertSuuntoFitCanonicalPreservesOriginalLocalTime();
assertSuuntoSummaryOffsetOverridesFitFallback();
assertSuuntoFitWithoutGpsStillParsesAsRouteImport();
assertSuuntoJsonCanonicalParsesSummary();
assertSuuntoJsonCanonicalUsesHeaderActivityNameFallbacks();
assertSuuntoHealthCanonicalParsesWithoutPersistence();
