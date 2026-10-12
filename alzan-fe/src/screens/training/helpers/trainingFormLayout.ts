export const TRAINING_CONTROL_SIZE = 44;

export const getSetTableLayout = (viewportWidth: number) => {
  const compact = viewportWidth < 400;

  return {
    compact,
    cardPaddingHorizontal: viewportWidth < 360 ? 12 : 16,
    rowGap: compact ? 4 : 8,
    rowPaddingHorizontal: compact ? 4 : 8,
    recordColumnWidth: compact ? 48 : 60,
  } as const;
};
