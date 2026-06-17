import assert from 'node:assert/strict';
import {
  formatSettingsPdfExportDate,
  getDefaultSettingsPdfExportRange,
  getSettingsPdfExportRangeError,
  loadSettingsPdfExportRange,
  parseSettingsPdfExportDateInput,
  saveSettingsPdfExportRange,
  SETTINGS_PDF_EXPORT_RANGE_STORAGE_KEY,
} from './settingsPdfExportRange';

const fixedNow = new Date('2026-06-17T12:00:00');

const createMemoryStorage = () => {
  const values = new Map<string, string>();

  return {
    values,
    storage: {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
    },
  };
};

assert.equal(formatSettingsPdfExportDate(parseSettingsPdfExportDateInput('2026-06-17')!), '2026-06-17');
assert.equal(parseSettingsPdfExportDateInput('2026-6-17'), null);
assert.equal(parseSettingsPdfExportDateInput('2026-02-30'), null);

const defaultRange = getDefaultSettingsPdfExportRange(fixedNow);
assert.equal(formatSettingsPdfExportDate(defaultRange.startDate), '2026-06-10');
assert.equal(formatSettingsPdfExportDate(defaultRange.endDate), '2026-06-17');

assert.deepEqual(
  getSettingsPdfExportRangeError({
    startDate: new Date('2026-06-18T00:00:00'),
    endDate: new Date('2026-06-17T00:00:00'),
  }),
  { type: 'inverted' },
);

const tooLong = getSettingsPdfExportRangeError({
  startDate: new Date('2026-01-01T00:00:00'),
  endDate: new Date('2026-06-17T00:00:00'),
});
assert.equal(tooLong?.type, 'tooLong');
assert.equal(formatSettingsPdfExportDate(tooLong?.minStartDate ?? fixedNow), '2026-03-17');

const runStorageAssertions = async () => {
  const { values, storage } = createMemoryStorage();
  await saveSettingsPdfExportRange(storage, {
    startDate: new Date('2026-05-01T00:00:00'),
    endDate: new Date('2026-05-31T00:00:00'),
  });

  assert.equal(
    values.get(SETTINGS_PDF_EXPORT_RANGE_STORAGE_KEY),
    JSON.stringify({ startDate: '2026-05-01', endDate: '2026-05-31' }),
  );

  const savedRange = await loadSettingsPdfExportRange(storage, fixedNow);
  assert.equal(formatSettingsPdfExportDate(savedRange.startDate), '2026-05-01');
  assert.equal(formatSettingsPdfExportDate(savedRange.endDate), '2026-05-31');

  values.set(SETTINGS_PDF_EXPORT_RANGE_STORAGE_KEY, '{"startDate":"nope","endDate":"2026-05-31"}');
  const fallbackRange = await loadSettingsPdfExportRange(storage, fixedNow);
  assert.equal(formatSettingsPdfExportDate(fallbackRange.startDate), '2026-06-10');
  assert.equal(formatSettingsPdfExportDate(fallbackRange.endDate), '2026-06-17');
};

runStorageAssertions().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
