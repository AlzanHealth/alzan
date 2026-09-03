import assert from 'node:assert/strict';
import {
  COMPACT_PREVIEW_ACTION_BREAKPOINT,
  getScheduledWorkoutPreviewLayout,
  isCompactPreviewLayout,
} from './scheduledWorkoutPreviewLayout.helper';

assert.equal(isCompactPreviewLayout(COMPACT_PREVIEW_ACTION_BREAKPOINT - 1), true);
assert.equal(isCompactPreviewLayout(COMPACT_PREVIEW_ACTION_BREAKPOINT), false);
assert.equal(isCompactPreviewLayout(1024), false);

const phoneLayout = getScheduledWorkoutPreviewLayout({
  viewportHeight: 852,
  topInset: 59,
  bottomInset: 34,
});
assert.equal(phoneLayout.modalHeight, 743);
assert.equal(phoneLayout.overlayPaddingTop, 67);
assert.equal(phoneLayout.overlayPaddingBottom, 42);

const largeLayout = getScheduledWorkoutPreviewLayout({ viewportHeight: 1200 });
assert.equal(largeLayout.modalHeight, 760);

const shortLayout = getScheduledWorkoutPreviewLayout({ viewportHeight: 480, topInset: 24, bottomInset: 20 });
assert.equal(shortLayout.modalHeight + shortLayout.overlayPaddingTop + shortLayout.overlayPaddingBottom, 480);

console.log('scheduledWorkoutPreviewLayout.helper.spec.ts passed');
