import assert from 'node:assert/strict';
import { DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS, TIME_INPUT_PROPS, parseLocalizedDecimal } from './numericInput';

assert.equal(DECIMAL_INPUT_PROPS.keyboardType, 'decimal-pad');
assert.equal(DECIMAL_INPUT_PROPS.inputMode, 'decimal');
assert.equal(INTEGER_INPUT_PROPS.keyboardType, 'number-pad');
assert.equal(INTEGER_INPUT_PROPS.inputMode, 'numeric');
assert.equal(TIME_INPUT_PROPS.keyboardType, 'numbers-and-punctuation');
assert.equal(TIME_INPUT_PROPS.inputMode, undefined);

assert.equal(parseLocalizedDecimal('1,5'), 1.5);
assert.equal(parseLocalizedDecimal(' 1.5 '), 1.5);
assert.equal(parseLocalizedDecimal('-2,25'), -2.25);
assert.equal(parseLocalizedDecimal('1,2,3'), 1.2);
assert.equal(parseLocalizedDecimal(''), null);
assert.equal(parseLocalizedDecimal('not-a-number'), null);

console.log('numericInput tests passed');
