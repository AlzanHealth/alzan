import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleProp, TextStyle, useColorScheme } from 'react-native';
import { SPORT_COLORS } from '../../theme/sportColors';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// Maps alzan sport keys to MaterialCommunityIcons names
const SPORT_ICONS: Record<string, IconName> = {
  running: 'run',
  cycling: 'bike',
  swimming: 'swim',
  football: 'soccer',
  basketball: 'basketball', // Added explicitly
  tennis: 'tennis',
  padel: 'tennis-ball', // Fallback as requested
  hiking: 'hiking',
  martial_arts: 'karate',
  climbing: 'terrain',
  walking: 'walk',
  gym: 'dumbbell',
  other: 'lightning-bolt', // Generic icon for "other" sports
};

export interface SportIconProps {
  sport: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export const SportIcon: React.FC<SportIconProps> = ({ sport, size = 24, color, style }) => {
  const systemColorScheme = useColorScheme();
  const defaultColor = systemColorScheme === 'dark' ? '#FFFFFF' : '#333333';

  // Normalize sport name (lowercase) to ensure matching
  const normalizedSport = sport?.toLowerCase() || '';

  // Get icon name or fallback
  const iconName = SPORT_ICONS[normalizedSport] || 'dots-horizontal'; // Fallback for unknown sports

  // Use provided color, or sport-specific color, or default based on theme
  const iconColor = color || SPORT_COLORS[normalizedSport] || defaultColor;

  return <MaterialCommunityIcons name={iconName} size={size} color={iconColor} style={style} />;
};
