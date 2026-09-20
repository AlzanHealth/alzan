// Keep room for the metric, its unit and the card padding without shrinking text.
export const getHomeSummaryColumns = (contentWidth: number, fontScale: number): 1 | 2 =>
  contentWidth >= 2 * 156 * Math.max(1, fontScale) + 16 ? 2 : 1;
