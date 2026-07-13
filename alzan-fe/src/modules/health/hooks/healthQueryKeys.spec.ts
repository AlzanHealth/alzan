import { strict as assert } from 'assert';
import { healthQueryKeys } from './healthQueryKeys';

function assertHealthKeysShareOneRefreshRoot(): void {
  assert.deepEqual(healthQueryKeys.all('user-1'), ['health', 'user-1']);
  assert.deepEqual(healthQueryKeys.weights('user-1', 100), ['health', 'user-1', 'weights', 100]);
  assert.deepEqual(healthQueryKeys.composition('user-1', 100), ['health', 'user-1', 'composition', 100]);
  assert.deepEqual(healthQueryKeys.measurements('user-1', 'abdomen', 30), [
    'health',
    'user-1',
    'measurements',
    'abdomen',
    30,
  ]);
}

assertHealthKeysShareOneRefreshRoot();
