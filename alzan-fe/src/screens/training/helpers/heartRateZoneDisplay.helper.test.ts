import { strict as assert } from 'assert';
import { getHeartRateZoneFillPercentage } from './heartRateZoneDisplay.helper';

function assertHeartRateZonesScaleRelativeToLargestDuration(): void {
  const durations = [27, 24, 22, 15, 13];
  const maxDuration = Math.max(...durations);

  const widths = durations.map(duration => getHeartRateZoneFillPercentage(duration, maxDuration));

  assert.equal(widths[0], 100);
  assert.equal(Math.round(widths[1] * 10) / 10, 88.9);
  assert.equal(Math.round(widths[2] * 10) / 10, 81.5);
  assert.equal(Math.round(widths[3] * 10) / 10, 55.6);
  assert.equal(Math.round(widths[4] * 10) / 10, 48.1);
}

function assertInvalidDurationsRenderEmptyBars(): void {
  assert.equal(getHeartRateZoneFillPercentage(null, 100), 0);
  assert.equal(getHeartRateZoneFillPercentage(30, 0), 0);
  assert.equal(getHeartRateZoneFillPercentage(Number.NaN, 100), 0);
}

assertHeartRateZonesScaleRelativeToLargestDuration();
assertInvalidDurationsRenderEmptyBars();
