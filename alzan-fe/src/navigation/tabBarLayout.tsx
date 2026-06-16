import React, { createContext, useContext, useState } from 'react';

// Shares the measured position of the floating tab bar so footers/overlays
// (e.g. the nutrition summary card) can sit above it on ANY device, web or
// tablet, without hardcoding the tab bar height/margin.
interface TabBarLayout {
  // Distance in px from the bottom of the screen to the TOP edge of the floating tab bar.
  topFromScreenBottom: number;
  setTopFromScreenBottom: (value: number) => void;
}

// Fallback matches the default tab bar style (bottom:30 + height:75) until the
// real bar reports its measured position.
export const DEFAULT_TAB_BAR_TOP_FROM_BOTTOM = 105;

const TabBarLayoutContext = createContext<TabBarLayout>({
  topFromScreenBottom: DEFAULT_TAB_BAR_TOP_FROM_BOTTOM,
  setTopFromScreenBottom: () => {},
});

export const TabBarLayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [topFromScreenBottom, setValue] = useState(DEFAULT_TAB_BAR_TOP_FROM_BOTTOM);

  // Ignore sub-pixel noise to avoid render loops from repeated onLayout calls.
  const setTopFromScreenBottom = (value: number) => {
    setValue(prev => (Math.abs(prev - value) > 1 ? value : prev));
  };

  return (
    <TabBarLayoutContext.Provider value={{ topFromScreenBottom, setTopFromScreenBottom }}>
      {children}
    </TabBarLayoutContext.Provider>
  );
};

export const useTabBarLayout = () => useContext(TabBarLayoutContext);
