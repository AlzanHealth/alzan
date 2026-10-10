import assert from 'node:assert/strict';
import {
  getSuuntoChartRange,
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

void exposesRequestedDetailPeriodsAndUsesRollingRanges();
void loadsEveryPageIncludingTheFinalPartialPage();
void propagatesPageErrors();
