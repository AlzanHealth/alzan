import assert from 'node:assert/strict';
import { revokeWearableConnectionsBeforeAccountDeletion } from './accountDeletion.helper';

async function run(): Promise<void> {
  let deletionContinued = false;
  await assert.rejects(
    revokeWearableConnectionsBeforeAccountDeletion(async () => {
      throw new Error('COROS_DEAUTHORIZATION_RETRY_ENQUEUE_FAILED');
    }).then(() => {
      deletionContinued = true;
    }),
    /COROS_DEAUTHORIZATION_RETRY_ENQUEUE_FAILED/,
  );
  assert.equal(deletionContinued, false);

  let disconnectCalls = 0;
  await revokeWearableConnectionsBeforeAccountDeletion(async () => {
    disconnectCalls += 1;
  });
  assert.equal(disconnectCalls, 1);
}

void run();
