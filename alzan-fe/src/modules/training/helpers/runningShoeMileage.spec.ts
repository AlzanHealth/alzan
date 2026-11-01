import assert from 'node:assert/strict';
import { getRunningShoeMileage, getRunningShoeMileageState } from './runningShoeMileage';

assert.equal(getRunningShoeMileage(null), 0, 'treats missing session distance as zero');
assert.equal(getRunningShoeMileage(42_195), 42.195, 'converts session meters to kilometers');
assert.equal(getRunningShoeMileage(-500), 0, 'does not count negative distance');

assert.equal(getRunningShoeMileageState(499, 500), 'within_limit', 'keeps mileage below the recommendation');
assert.equal(getRunningShoeMileageState(500, 500), 'reached', 'detects reaching the recommendation');
assert.equal(getRunningShoeMileageState(501, 500), 'exceeded', 'detects mileage beyond the recommendation');
assert.equal(getRunningShoeMileageState(501, null), 'no_limit', 'does not show a limit without a recommendation');

console.log('Running shoe mileage checks passed.');
