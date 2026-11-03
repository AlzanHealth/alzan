import assert from 'node:assert/strict';
import { parseRunningShoeInitialKilometers } from './runningShoeInitialKilometers';

assert.equal(parseRunningShoeInitialKilometers(''), 0, 'treats an empty field as zero');
assert.equal(parseRunningShoeInitialKilometers('   '), 0, 'treats a blank field as zero');
assert.equal(parseRunningShoeInitialKilometers('0'), 0, 'accepts zero kilometers');
assert.equal(parseRunningShoeInitialKilometers('12.34'), 12.34, 'accepts a decimal point');
assert.equal(parseRunningShoeInitialKilometers('12,34'), 12.34, 'accepts a decimal comma');
assert.equal(
  parseRunningShoeInitialKilometers((1e-7).toString()),
  1e-7,
  'accepts values serialized in exponent notation during editing',
);
assert.equal(parseRunningShoeInitialKilometers('1e305'), 1e305, 'accepts the finite meter-conversion ceiling');
assert.equal(parseRunningShoeInitialKilometers('.5'), 0.5, 'accepts a leading decimal point');
assert.equal(parseRunningShoeInitialKilometers(',5'), 0.5, 'accepts a leading decimal comma');
assert.equal(parseRunningShoeInitialKilometers('5.'), 5, 'accepts a trailing decimal point');
assert.equal(parseRunningShoeInitialKilometers('5,'), 5, 'accepts a trailing decimal comma');

assert.equal(parseRunningShoeInitialKilometers('-1'), null, 'rejects negative kilometers');
assert.equal(parseRunningShoeInitialKilometers('-1e-7'), null, 'rejects negative values in exponent notation');
assert.equal(parseRunningShoeInitialKilometers('NaN'), null, 'rejects NaN');
assert.equal(parseRunningShoeInitialKilometers('Infinity'), null, 'rejects infinity');
assert.equal(parseRunningShoeInitialKilometers('1e309'), null, 'rejects exponent values that overflow to infinity');
assert.equal(
  parseRunningShoeInitialKilometers('1.000001e305'),
  null,
  'rejects kilometers above the meter-conversion ceiling',
);
assert.equal(
  parseRunningShoeInitialKilometers('1e306'),
  null,
  'rejects values that would overflow when converted to meters',
);
assert.equal(parseRunningShoeInitialKilometers('1,2.3'), null, 'rejects mixed decimal separators');
assert.equal(parseRunningShoeInitialKilometers('1 2'), null, 'rejects malformed numeric input');
assert.equal(parseRunningShoeInitialKilometers('9'.repeat(400)), null, 'rejects values that overflow to infinity');

console.log('Running shoe initial kilometer checks passed.');
