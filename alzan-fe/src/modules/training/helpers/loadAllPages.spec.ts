import assert from 'node:assert/strict';
import { loadAllPages } from './loadAllPages';

const values = Array.from({ length: 1_003 }, (_, index) => index);
const requestedRanges: Array<[number, number]> = [];
const limitedRanges: Array<[number, number]> = [];

const verifyPagination = async () => {
  const rows = await loadAllPages(async (from, to) => {
    requestedRanges.push([from, to]);
    return values.slice(from, to + 1);
  });

  assert.equal(rows.length, values.length, 'loads records beyond the first page');
  assert.deepEqual(rows, values, 'preserves row order across pages');
  assert.deepEqual(
    requestedRanges,
    [
      [0, 999],
      [1_000, 1_999],
    ],
    'requests stable, non-overlapping ranges',
  );

  const limitedRows = await loadAllPages(
    async (from, to) => {
      limitedRanges.push([from, to]);
      return values.slice(from, to + 1);
    },
    1_000,
    130,
  );

  assert.deepEqual(limitedRows, values.slice(0, 130), 'stops after the requested result limit');
  assert.deepEqual(limitedRanges, [[0, 129]], 'does not fetch beyond the requested result limit');

  console.log('Paged row loading checks passed.');
};

void verifyPagination();
