import { strict as assert } from 'assert';
import {
  STEPS_PROVIDER_AUDIT,
  assertStepsProviderAuditIsCoherent,
  getStepsProviderAuditSummary,
} from './provider-steps-audit';

function assertAuditCoversExpectedProviders(): void {
  const providers = STEPS_PROVIDER_AUDIT.map(item => item.provider).sort();
  assert.deepEqual(providers, [
    'apple_health',
    'coros',
    'fitbit',
    'garmin',
    'health_connect',
    'oura',
    'polar',
    'suunto',
    'ultrahuman',
    'whoop',
  ]);
}

function assertEveryImplementedProviderFeedsTheStepsScreen(): void {
  const summary = getStepsProviderAuditSummary();
  assert.deepEqual(summary.completeProviders.sort(), ['apple_health', 'coros', 'health_connect', 'suunto']);
  assert.equal(summary.screenSourceOfTruth, 'daily_steps');
}

function assertCloudProvidersMatchAvailableStepSync(): void {
  const garmin = STEPS_PROVIDER_AUDIT.find(item => item.provider === 'garmin');
  const suunto = STEPS_PROVIDER_AUDIT.find(item => item.provider === 'suunto');
  assert.equal(garmin?.status, 'mapper_only');
  assert.equal(garmin?.feedsStepsScreen, false);
  assert.equal(suunto?.status, 'complete');
  assert.equal(suunto?.feedsDailySteps, true);
  assert.equal(suunto?.feedsStepsScreen, true);
}

assertStepsProviderAuditIsCoherent();
assertAuditCoversExpectedProviders();
assertEveryImplementedProviderFeedsTheStepsScreen();
assertCloudProvidersMatchAvailableStepSync();
