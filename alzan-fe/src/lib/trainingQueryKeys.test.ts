import { strict as assert } from 'assert';
import { QueryClient } from '@tanstack/react-query';
import { invalidateTrainingCalendar, trainingQueryKeys } from './trainingQueryKeys';

async function assertEveryCalendarKeyIsInvalidated(): Promise<void> {
  const queryClient = new QueryClient();
  for (const key of Object.values(trainingQueryKeys)) queryClient.setQueryData(key, { stale: false });
  queryClient.setQueryData(['dashboard', 'home-summary', 'user-1'], { stale: false });

  invalidateTrainingCalendar(queryClient);
  await Promise.resolve();

  for (const key of Object.values(trainingQueryKeys)) {
    assert.equal(queryClient.getQueryState(key)?.isInvalidated, true, `expected ${key.join('/')} to be invalidated`);
  }
  assert.equal(queryClient.getQueryState(['dashboard', 'home-summary', 'user-1'])?.isInvalidated, true);
}

void assertEveryCalendarKeyIsInvalidated();
