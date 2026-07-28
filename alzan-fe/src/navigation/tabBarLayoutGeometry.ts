export const getTabBarBottomInset = (safeAreaBottom: number): number => Math.max(0, safeAreaBottom);

export const getInitialTabBarTopFromScreenBottom = (safeAreaBottom: number, tabBarHeight: number): number =>
  getTabBarBottomInset(safeAreaBottom) + tabBarHeight;

export const getTabBarTopFromScreenBottom = ({ viewportHeight, y }: { viewportHeight: number; y: number }): number =>
  Math.max(0, viewportHeight - y);
