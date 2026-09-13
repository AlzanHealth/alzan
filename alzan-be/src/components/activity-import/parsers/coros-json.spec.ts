import { strict as assert } from 'assert';
import { parseCorosJson } from './coros-json';

assert.deepEqual(
  parseCorosJson(
    '{"labelId":418173315956375553,"planWorkoutId":9223372036854775806,"distance":12.3,"mode":8,"text":"418173315956375553"}',
  ),
  {
    labelId: '418173315956375553',
    planWorkoutId: '9223372036854775806',
    distance: 12.3,
    mode: 8,
    text: '418173315956375553',
  },
);
assert.deepEqual(parseCorosJson('{"text":"escaped \\"1234567890123456789\\"","negative":-9223372036854775806}'), {
  text: 'escaped "1234567890123456789"',
  negative: '-9223372036854775806',
});
assert.throws(() => parseCorosJson('{"invalid":}'));
