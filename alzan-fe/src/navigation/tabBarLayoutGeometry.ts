export const getTabBarBottomInset = (safeAreaBottom: number): number => Math.max(0, safeAreaBottom);

export const getTabBarBottomOffset = (safeAreaBottom: number, floatingGap: number): number =>
  getTabBarBottomInset(safeAreaBottom) + Math.max(0, floatingGap);

export const getInitialTabBarTopFromScreenBottom = (
  safeAreaBottom: number,
  tabBarHeight: number,
  floatingGap: number,
): number => getTabBarBottomOffset(safeAreaBottom, floatingGap) + tabBarHeight;

export const getTabBarTopFromScreenBottom = ({ viewportHeight, y }: { viewportHeight: number; y: number }): number =>
  Math.max(0, viewportHeight - y);

export type ResizeEventTarget = {
  addEventListener: (eventName: 'resize', listener: () => void) => void;
  removeEventListener: (eventName: 'resize', listener: () => void) => void;
};

export const isResizeEventTarget = (value: unknown): value is ResizeEventTarget => {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'addEventListener' in value &&
    typeof value.addEventListener === 'function' &&
    'removeEventListener' in value &&
    typeof value.removeEventListener === 'function'
  );
};
