import assert from 'node:assert/strict';
import { getSuuntoHealthEducation } from './suuntoHealthEducation';

function providesThreePlainLanguageGuidesForEveryMetric(): void {
  const metricPrefixes = {
    heart_rate: 'health.suuntoHeartRate',
    hrv_rmssd: 'health.suuntoHrv',
    recovery: 'health.suuntoBalance',
    sleep: 'health.suuntoSleep',
    stress: 'health.suuntoStress',
    steps: 'health.suuntoSteps',
    energy: 'health.suuntoEnergy',
  } as const;

  for (const [metric, prefix] of Object.entries(metricPrefixes) as Array<
    [keyof typeof metricPrefixes, (typeof metricPrefixes)[keyof typeof metricPrefixes]]
  >) {
    const education = getSuuntoHealthEducation(metric);
    assert.deepEqual(
      education.sections.map(section => section.topic),
      ['what', 'interpretation', 'measurement'],
      `${metric} should explain what it measures, how to read it, and where it comes from`,
    );
    assert.equal(education.titleTranslationKey, `${prefix}About`);
    assert.ok(education.sections.every(section => section.translationKey.startsWith(prefix)));
  }
}

providesThreePlainLanguageGuidesForEveryMetric();
