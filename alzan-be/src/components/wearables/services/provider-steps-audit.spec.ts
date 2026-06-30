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

function assertOnlyProductiveLocalProvidersFeedStepsScreen(): void {
  const summary = getStepsProviderAuditSummary();
  assert.deepEqual(summary.completeProviders.sort(), ['apple_health', 'health_connect']);
  assert.equal(summary.screenSourceOfTruth, 'daily_steps');
}

function assertGarminAndSuuntoAreNotOverPromised(): void {
  const garmin = STEPS_PROVIDER_AUDIT.find(item => item.provider === 'garmin');
  const suunto = STEPS_PROVIDER_AUDIT.find(item => item.provider === 'suunto');
  assert.equal(garmin?.status, 'mapper_only');
  assert.equal(garmin?.feedsStepsScreen, false);
  assert.equal(suunto?.status, 'activity_steps_only');
  assert.equal(suunto?.feedsDailySteps, false);
}

assertStepsProviderAuditIsCoherent();
assertAuditCoversExpectedProviders();
assertOnlyProductiveLocalProvidersFeedStepsScreen();
assertGarminAndSuuntoAreNotOverPromised();
