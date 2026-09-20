import assert from 'node:assert/strict';
import { getHomeSummaryColumns } from './homeLayout';

assert.equal(getHomeSummaryColumns(288, 1), 1, 'small phone');
assert.equal(getHomeSummaryColumns(358, 1), 2, 'standard phone');
assert.equal(getHomeSummaryColumns(358, 1.3), 1, 'larger native text');
assert.equal(getHomeSummaryColumns(358, 2), 1, 'accessibility text');
assert.equal(getHomeSummaryColumns(736, 2), 2, 'tablet with room for large text');
assert.equal(getHomeSummaryColumns(0, 1), 1, 'before layout measurement');
console.log('Home responsive layout checks passed');
