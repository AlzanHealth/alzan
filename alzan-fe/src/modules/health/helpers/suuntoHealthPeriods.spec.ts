import assert from 'node:assert/strict';
import {
  getSuuntoChartRange,
  getSuuntoDailyPeriodStart,
  getSuuntoPeriodStart,
  loadAllSuuntoPages,
  SUUNTO_DETAIL_PERIODS,
} from './suuntoHealthPeriods';

function exposesRequestedDetailPeriodsAndUsesRollingRanges(): void {
  assert.deepEqual(SUUNTO_DETAIL_PERIODS, ['D', 'W', 'M', '3M', '6M', 'ALL']);
  const reference = new Date('2026-10-10T12:00:00.000Z');

  assert.equal(getSuuntoPeriodStart('D', reference), '2026-10-09T12:00:00.000Z');
  assert.equal(getSuuntoPeriodStart('3M', reference), '2026-07-12T12:00:00.000Z');
  assert.equal(getSuuntoPeriodStart('6M', reference), '2026-04-13T12:00:00.000Z');
  assert.equal(getSuuntoPeriodStart('ALL', reference), null);
  assert.deepEqual(SUUNTO_DETAIL_PERIODS.map(getSuuntoChartRange), ['D', 'S', 'M', '6M', '6M', 'A']);
}

async function loadsEveryPageIncludingTheFinalPartialPage(): Promise<void> {
  const allRows = Array.from({ length: 5 }, (_, index) => index + 1);
  const result = await loadAllSuuntoPages(
    async (offset, pageSize) => ({
      data: allRows.slice(offset, offset + pageSize),
      error: null,
    }),
    2,
  );

  assert.deepEqual(result, allRows);
}

async function propagatesPageErrors(): Promise<void> {
  await assert.rejects(
    () => loadAllSuuntoPages(async () => ({ data: null, error: new Error('API unavailable') })),
    /API unavailable/,
  );
}

async function loadsRowsBeyondTheFormerFiftyThousandRowLimit(): Promise<void> {
  const allRows = Array.from({ length: 50_001 }, (_, index) => index);
  const result = await loadAllSuuntoPages(async (offset, pageSize) => ({
    data: allRows.slice(offset, offset + pageSize),
    error: null,
  }));

  assert.equal(result.length, allRows.length);
  assert.equal(result.at(-1), 50_000);
}

void exposesRequestedDetailPeriodsAndUsesRollingRanges();
const localMidnight = new Date(2026, 9, 12, 0, 15);
assert.equal(getSuuntoDailyPeriodStart('D', localMidnight), '2026-10-12');
assert.equal(getSuuntoDailyPeriodStart('W', localMidnight), '2026-10-06');
assert.equal(getSuuntoDailyPeriodStart('M', localMidnight), '2026-09-13');
assert.equal(getSuuntoDailyPeriodStart('ALL', localMidnight), null);
void loadsEveryPageIncludingTheFinalPartialPage();
void propagatesPageErrors();
void loadsRowsBeyondTheFormerFiftyThousandRowLimit();
