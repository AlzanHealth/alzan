// Static colors for backward compatibility (light theme)
// For dynamic theming, use useTheme() hook from ThemeContext
export const colors = {
  background: '#F2F2F7', // Light neutral background
  surface: 'rgba(255, 255, 255, 0.7)', // Glassy surface
  surfaceHighlight: 'rgba(255, 255, 255, 0.9)',
  textPrimary: '#000000',
  textSecondary: '#5C5C63',
  primary: '#007AFF', // Apple Blue
  secondary: '#5856D6', // Purple
  accent: '#5AC8FA', // Teal/Blue
  danger: '#FF3B30',
  warning: '#FF9500', // Orange
  success: '#34C759',
  info: '#5AC8FA', // Blue (same as accent for now)
  border: 'rgba(0, 0, 0, 0.05)',
  shadow: 'rgba(0, 0, 0, 0.1)',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
};

export const borderRadius = {
  s: 8,
  m: 12,
  l: 20,
  full: 9999,
};

export const typography = {
  h1: { fontSize: 32, fontWeight: '700' },
  h2: { fontSize: 24, fontWeight: '600' },
  h3: { fontSize: 20, fontWeight: '600' },
  h4: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  button: { fontSize: 16, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400', color: '#5C5C63' },
} as const;

export const shadows = {
  soft: {
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
};

// Dark shadows for dark mode
export const darkShadows = {
  soft: {
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
};
