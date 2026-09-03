export const COMPACT_PREVIEW_ACTION_BREAKPOINT = 600;

export const SCHEDULED_PREVIEW_MAX_HEIGHT = 760;

type ScheduledWorkoutPreviewLayoutOptions = {
  viewportHeight: number;
  topInset?: number;
  bottomInset?: number;
};

export type ScheduledWorkoutPreviewLayout = {
  modalHeight: number;
  overlayPaddingTop: number;
  overlayPaddingBottom: number;
};

export const getScheduledWorkoutPreviewLayout = ({
  viewportHeight,
  topInset = 0,
  bottomInset = 0,
}: ScheduledWorkoutPreviewLayoutOptions): ScheduledWorkoutPreviewLayout => {
  const overlayPaddingTop = Math.max(16, topInset + 8);
  const overlayPaddingBottom = Math.max(16, bottomInset + 8);
  const availableHeight = Math.max(0, viewportHeight - overlayPaddingTop - overlayPaddingBottom);

  return {
    modalHeight: Math.min(SCHEDULED_PREVIEW_MAX_HEIGHT, availableHeight),
    overlayPaddingTop,
    overlayPaddingBottom,
  };
};

export const isCompactPreviewLayout = (viewportWidth: number): boolean =>
  viewportWidth < COMPACT_PREVIEW_ACTION_BREAKPOINT;
