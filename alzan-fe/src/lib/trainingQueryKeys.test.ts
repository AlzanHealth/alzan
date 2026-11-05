import { strict as assert } from 'assert';
import { QueryClient } from '@tanstack/react-query';
import {
  enduranceTemplatesQueryKey,
  invalidateEnduranceTemplates,
  invalidateTrainingCalendar,
  trainingQueryKeys,
} from './trainingQueryKeys';

async function assertEveryCalendarKeyIsInvalidated(): Promise<void> {
  const queryClient = new QueryClient();
  for (const key of Object.values(trainingQueryKeys)) queryClient.setQueryData(key, { stale: false });
  queryClient.setQueryData(['dashboard', 'home-summary', 'user-1'], { stale: false });
  queryClient.setQueryData(['runningShoes', 'user-1'], { total_distance_m: 5000 });

  invalidateTrainingCalendar(queryClient);
  await Promise.resolve();

  for (const key of Object.values(trainingQueryKeys)) {
    assert.equal(queryClient.getQueryState(key)?.isInvalidated, true, `expected ${key.join('/')} to be invalidated`);
  }
  assert.equal(queryClient.getQueryState(['dashboard', 'home-summary', 'user-1'])?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(['runningShoes', 'user-1'])?.isInvalidated, true);
}

void assertEveryCalendarKeyIsInvalidated();

async function assertEnduranceTemplateListsAreInvalidated(): Promise<void> {
  const queryClient = new QueryClient();
  const userTemplateKey = [...enduranceTemplatesQueryKey, 'user-1'] as const;
  queryClient.setQueryData(userTemplateKey, [{ id: 'template-1' }]);

  await invalidateEnduranceTemplates(queryClient);

  assert.equal(queryClient.getQueryState(userTemplateKey)?.isInvalidated, true);
}

void assertEnduranceTemplateListsAreInvalidated();
