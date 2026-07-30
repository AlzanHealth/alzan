import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getInitialTabBarTopFromScreenBottom,
  getTabBarBottomInset,
  getTabBarBottomOffset,
  getTabBarTopFromScreenBottom,
  isResizeEventTarget,
} from './tabBarLayoutGeometry';

export const TAB_BAR_HEIGHT = 75;
export const TAB_BAR_CLEARANCE = 12;
export const TAB_BAR_FLOATING_GAP = 20;

export {
  getInitialTabBarTopFromScreenBottom,
  getTabBarBottomInset,
  getTabBarBottomOffset,
  getTabBarTopFromScreenBottom,
  isResizeEventTarget,
};

// Shares the measured position of the floating tab bar so footers/overlays
// (e.g. the nutrition summary card) can sit above it on ANY device, web or
// tablet, without hardcoding the tab bar height/margin.
interface TabBarLayout {
  // Distance in px from the bottom of the screen to the TOP edge of the floating tab bar.
  topFromScreenBottom: number;
  safeAreaBottom: number;
  summaryOverlayHeight: number;
  setTopFromScreenBottom: (value: number) => void;
  setSummaryOverlayHeight: (value: number) => void;
}

const TabBarLayoutContext = createContext<TabBarLayout>({
  topFromScreenBottom: 0,
  safeAreaBottom: 0,
  summaryOverlayHeight: 0,
  setTopFromScreenBottom: () => {},
  setSummaryOverlayHeight: () => {},
});

export const TabBarLayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { bottom: safeAreaBottom } = useSafeAreaInsets();
  const [topFromScreenBottom, setValue] = useState(() =>
    getInitialTabBarTopFromScreenBottom(safeAreaBottom, TAB_BAR_HEIGHT, TAB_BAR_FLOATING_GAP),
  );
  const [summaryOverlayHeight, setSummaryOverlayHeight] = useState(0);

  useEffect(() => {
    setValue(getInitialTabBarTopFromScreenBottom(safeAreaBottom, TAB_BAR_HEIGHT, TAB_BAR_FLOATING_GAP));
  }, [safeAreaBottom]);

  // Ignore sub-pixel noise to avoid render loops from repeated onLayout calls.
  const setTopFromScreenBottom = useCallback((value: number) => {
    setValue(prev => (Math.abs(prev - value) > 1 ? value : prev));
  }, []);

  return (
    <TabBarLayoutContext.Provider
      value={{
        topFromScreenBottom,
        safeAreaBottom,
        summaryOverlayHeight,
        setTopFromScreenBottom,
        setSummaryOverlayHeight,
      }}
    >
      {children}
    </TabBarLayoutContext.Provider>
  );
};

export const useTabBarLayout = () => useContext(TabBarLayoutContext);
