export const getConnectedAppsContentBottomPadding = (topFromScreenBottom: number, clearance: number): number =>
  Math.max(0, topFromScreenBottom) + Math.max(0, clearance);
