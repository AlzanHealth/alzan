import assert from 'node:assert/strict';
import { convertSpeedToUi, formatPaceTime } from './unitConversionUtils';

assert.equal(formatPaceTime(239.6), '4:00');
assert.equal(formatPaceTime(3599.6), '60:00');

assert.equal(convertSpeedToUi(1000 / 239.6, 'running', 'km').label, '4:00 min/km');
assert.equal(convertSpeedToUi(1609.34 / 386.4, 'running', 'miles').label, '6:26 min/mi');
assert.equal(convertSpeedToUi(100 / 119.6, 'swimming', 'km').label, '2:00/100m');
assert.equal(convertSpeedToUi(100 / (109.6 * 1.09361), 'swimming', 'miles').label, '1:50/100yd');

console.log('unitConversionUtils tests passed');
