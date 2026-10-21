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

  const searchCandidates = values.slice(0, 205);
  const searchRanges: Array<[number, number]> = [];
  const rankedRows = await loadAllPages(
    async (from, to) => {
      searchRanges.push([from, to]);
      return searchCandidates.slice(from, to + 1);
    },
    180,
    360,
  );
  assert.deepEqual(rankedRows, searchCandidates, 'ranked search loads matches beyond the RPC row cap');
  assert.deepEqual(
    searchRanges,
    [
      [0, 179],
      [180, 359],
    ],
    'ranked requests stay within the 180-row cap',
  );
  assert.ok(rankedRows.length > 180, 'the catalog can advertise another page when 180 matches are visible');

  console.log('Paged row loading checks passed.');
};

void verifyPagination();
