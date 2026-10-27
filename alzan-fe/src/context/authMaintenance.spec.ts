import assert from 'node:assert/strict';
import { createAuthMaintenanceRunner } from './authMaintenance';

const main = async () => {
  let now = 0;
  const runner = createAuthMaintenanceRunner(() => now);
  let copies = 0;
  let finish: () => void = () => {};
  const pending = new Promise<void>(resolve => {
    finish = resolve;
  });
  const maintain = async () => {
    copies++;
    await pending;
  };
  const initial = runner.run('alice', maintain);
  const signedIn = runner.run('alice', maintain);
  finish();
  await Promise.all([initial, signedIn]);
  assert.equal(copies, 1, 'startup and SIGNED_IN must not copy plans concurrently');
  await runner.run('alice', maintain);
  assert.equal(copies, 1, 'repeated focus events must not repeat maintenance immediately');
  await runner.run('bob', maintain);
  assert.equal(copies, 2);
  now = 60_000;
  await runner.run('alice', maintain);
  assert.equal(copies, 3);
  now = 120_000;
  await assert.rejects(
    runner.run('alice', async () => {
      copies++;
      throw new Error('offline');
    }),
    /offline/,
  );
  await runner.run('alice', maintain);
  assert.equal(copies, 4, 'a failure must not start an auth-event retry storm');
  now = 180_000;
  await runner.run('alice', maintain);
  assert.equal(copies, 5);
  console.log('Auth maintenance: shared startup, focus cooldown, failure recovery and user isolation passed');
};
void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
