import assert from 'node:assert/strict';
import {
  getHealthHistoryChartReadout,
  getLast30DaysRecords,
  getSelectedHealthHistoryPoint,
} from './healthHistoryChartPresentation';

const referenceDate = new Date('2026-10-11T12:00:00.000Z');
assert.deepEqual(
  getLast30DaysRecords(
    [
      { id: 'recent', measured_at: '2026-10-10T12:00:00.000Z' },
      { id: 'boundary', measured_at: '2026-09-11T12:00:00.000Z' },
      { id: 'old', measured_at: '2026-09-11T11:59:59.000Z' },
      { id: 'future', measured_at: '2026-10-12T12:00:00.000Z' },
    ],
    referenceDate,
  ).map(record => record.id),
  ['recent', 'boundary'],
);

const selectedPoint = {
  value: 0,
  date: new Date('2026-10-09T12:00:00.000Z'),
  dateRange: '9 oct 2026',
};

assert.deepEqual(
  getHealthHistoryChartReadout({
    selectedPoint,
    summaryValue: '72 bpm',
    summaryDate: 'Últimos 7 días',
    formatValue: value => `${value} bpm`,
    formatDate: point => point.dateRange,
  }),
  { value: '0 bpm', date: '9 oct 2026', isSelected: true },
);

assert.deepEqual(
  getHealthHistoryChartReadout({
    summaryValue: '72 bpm',
    summaryDate: 'Últimos 7 días',
    formatValue: value => `${value} bpm`,
    formatDate: point => point.dateRange,
  }),
  { value: '72 bpm', date: 'Últimos 7 días', isSelected: false },
);

const refreshedData = [{ value: 74, date: selectedPoint.date, label: '9' }];
assert.deepEqual(getSelectedHealthHistoryPoint(refreshedData, selectedPoint), {
  ...refreshedData[0],
  dateRange: selectedPoint.dateRange,
});
assert.equal(getSelectedHealthHistoryPoint([], selectedPoint), undefined);

console.log('Health history chart presentation tests passed.');
