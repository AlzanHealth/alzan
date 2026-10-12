import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { healthQueryKeys } from './healthQueryKeys';
import { invalidateStepsRelatedQueries } from './stepsQueryInvalidation';

async function assertStepsUpdateInvalidatesHomeAndHealthSummaries(): Promise<void> {
  const queryClient = new QueryClient();
  const stepsKey = [...healthQueryKeys.steps('user-1'), 'today', '2026-10-12'];
  const healthSummaryKey = [...healthQueryKeys.all('user-1'), 'suunto-24-7', 'W'];
  queryClient.setQueryData(stepsKey, 8000);
  queryClient.setQueryData(healthSummaryKey, { steps: [] });

  await invalidateStepsRelatedQueries(queryClient, 'user-1');

  assert.equal(queryClient.getQueryState(stepsKey)?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(healthSummaryKey)?.isInvalidated, true);
  queryClient.clear();
}

void assertStepsUpdateInvalidatesHomeAndHealthSummaries();
