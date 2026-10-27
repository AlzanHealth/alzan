import assert from 'node:assert/strict';
import {
  createCompositionRequestGuard,
  CompositionRefreshPausedError,
  reportCompositionRefreshFailure,
} from './compositionRequestGuard';

const main = async () => {
  let now = 0;
  const guard = createCompositionRequestGuard(() => now);
  let writes = 0;
  let finish: () => void = () => {};
  const pending = new Promise<void>(resolve => {
    finish = resolve;
  });
  const calculate = async () => {
    writes++;
    await pending;
    return { success: true };
  };
  const first = guard.run('alice', '2026-10-27', calculate);
  const second = guard.run('alice', '2026-10-27', calculate);
  finish();
  await Promise.all([first, second]);
  assert.equal(writes, 1, 'simultaneous screens must share the database calculation');

  const conflict = async () => {
    writes++;
    return { success: false, reason: 'inputs_changed' };
  };
  await guard.run('alice', '2026-10-27', conflict);
  const afterConflict = writes;
  await assert.rejects(guard.run('alice', '2026-10-26', conflict), CompositionRefreshPausedError);
  assert.equal(writes, afterConflict, 'cooldown must protect every date for this user');
  await guard.run('bob', '2026-10-27', async () => ({ success: true }));
  guard.inputsChanged('alice');
  await guard.run('alice', '2026-10-27', async () => ({ success: true }));

  const unavailable = async () => {
    writes++;
    throw new Error('offline');
  };
  await assert.rejects(guard.run('alice', '2026-10-27', unavailable), /offline/);
  guard.inputsChanged('alice');
  await assert.rejects(guard.run('alice', '2026-10-27', unavailable), CompositionRefreshPausedError);
  now = 30_000;
  await assert.rejects(guard.run('alice', '2026-10-27', unavailable), /offline/);
  now = 60_000;
  await assert.rejects(guard.run('alice', '2026-10-27', unavailable), CompositionRefreshPausedError);
  now = 90_000;
  await guard.run('alice', '2026-10-27', async () => ({ success: true }));
  await guard.run('alice', '2026-10-27', async () => ({ success: true }));

  const slowSuccess = guard.run('alice', 'old', async () => {
    await Promise.resolve();
    await Promise.resolve();
    return { success: true };
  });
  await assert.rejects(guard.run('alice', 'new', unavailable), /offline/);
  await slowSuccess;
  assert.throws(
    () => guard.assertAvailable('alice'),
    CompositionRefreshPausedError,
    'a calculation started before a newer failure must not reopen the circuit',
  );
  const timedGuard = createCompositionRequestGuard(() => 0, 5);
  let aborted = false;
  await assert.rejects(
    timedGuard.run(
      'alice',
      'today',
      signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('aborted'));
            },
            { once: true },
          );
        }),
    ),
    /aborted/,
  );
  assert.equal(aborted, true, 'timeouts must abort actual network work');
  assert.throws(() => timedGuard.assertAvailable('alice'), CompositionRefreshPausedError);
  const logged: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    reportCompositionRefreshFailure(new CompositionRefreshPausedError(30_000));
    reportCompositionRefreshFailure({ code: '42501', details: 'private-health-data' });
    assert.equal(logged.length, 1);
    assert.doesNotMatch(JSON.stringify(logged), /private-health-data|42501/);
  } finally {
    console.error = originalError;
  }
  console.log('Composition guard: concurrency, cooldown, recovery and user isolation passed');
};
void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
