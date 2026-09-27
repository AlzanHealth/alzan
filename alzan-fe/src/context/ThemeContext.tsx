import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = '@alzan_theme_mode';

// Light theme colors
export const lightColors = {
  background: '#F2F2F7',
  surface: 'rgba(255, 255, 255, 0.7)',
  surfaceHighlight: 'rgba(255, 255, 255, 0.9)',
  surfaceSolid: '#FFFFFF',
  textPrimary: '#000000',
  textSecondary: '#5C5C63',
  primary: '#007AFF',
  secondary: '#5856D6',
  accent: '#5AC8FA',
  danger: '#FF3B30',
  warning: '#FF9500',
  success: '#34C759',
  successText: '#187A35',
  info: '#5AC8FA',
  border: 'rgba(0, 0, 0, 0.05)',
  shadow: 'rgba(0, 0, 0, 0.1)',
  white: '#FFFFFF',
  // Gradient colors for backgrounds
  gradientStart: '#F8FAFC',
  gradientEnd: '#F1F5F9',
  // Card and modal specific
  cardBackground: '#FFFFFF',
  modalOverlay: 'rgba(0, 0, 0, 0.3)',
  inputPlaceholder: 'rgba(0, 0, 0, 0.2)',
  disabledButton: '#E5E5EA',
  // Specific component colors
  dangerBackground: '#FFF5F5',
  selectedOptionBackground: '#E8F4FD',
};

// Dark theme colors
export const darkColors = {
  background: '#000000',
  surface: 'rgba(28, 28, 30, 0.8)',
  surfaceHighlight: 'rgba(44, 44, 46, 0.9)',
  surfaceSolid: '#1C1C1E',
  textPrimary: '#FFFFFF',
  textSecondary: '#AEAEB6',
  primary: '#0A84FF',
  secondary: '#5E5CE6',
  accent: '#64D2FF',
  danger: '#FF453A',
  warning: '#FF9F0A',
  success: '#30D158',
  successText: '#30D158',
  info: '#64D2FF',
  border: 'rgba(255, 255, 255, 0.1)',
  shadow: 'rgba(0, 0, 0, 0.3)',
  white: '#FFFFFF',
  // Gradient colors for backgrounds
  gradientStart: '#000000',
  gradientEnd: '#1C1C1E',
  // Card and modal specific
  cardBackground: '#1C1C1E',
  modalOverlay: 'rgba(0, 0, 0, 0.6)',
  inputPlaceholder: 'rgba(255, 255, 255, 0.3)',
  disabledButton: '#3A3A3C',
  // Specific component colors
  dangerBackground: 'rgba(255, 69, 58, 0.15)',
  selectedOptionBackground: 'rgba(10, 132, 255, 0.2)',
};

export type ThemeColors = typeof lightColors;

interface ThemeContextType {
  colors: ThemeColors;
  isDark: boolean;
  effectiveTheme: 'light' | 'dark';
  themePreference: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreference] = useState<ThemeMode>('system');
  const [, setIsLoaded] = useState(false);

  // Load theme from AsyncStorage on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored && (stored === 'light' || stored === 'dark' || stored === 'system')) {
          setThemePreference(stored as ThemeMode);
        }
      } catch (e) {
        console.log('[ThemeContext] Error loading theme:', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTheme();
  }, []);

  // Set theme and persist to AsyncStorage
  const setTheme = useCallback(async (mode: ThemeMode) => {
    setThemePreference(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (e) {
      console.log('[ThemeContext] Error saving theme:', e);
    }
  }, []);

  const { colors, isDark, effectiveTheme } = useMemo(() => {
    let resolvedTheme: 'light' | 'dark';

    if (themePreference === 'system') {
      resolvedTheme = systemColorScheme === 'dark' ? 'dark' : 'light';
    } else {
      resolvedTheme = themePreference;
    }

    return {
      colors: resolvedTheme === 'dark' ? darkColors : lightColors,
      isDark: resolvedTheme === 'dark',
      effectiveTheme: resolvedTheme,
    };
  }, [themePreference, systemColorScheme]);

  return (
    <ThemeContext.Provider
      value={{
        colors,
        isDark,
        effectiveTheme,
        themePreference,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // Return default light theme for components outside provider
    return {
      colors: lightColors,
      isDark: false,
      effectiveTheme: 'light',
      themePreference: 'system',
      setTheme: () => {},
    };
  }
  return context;
};
