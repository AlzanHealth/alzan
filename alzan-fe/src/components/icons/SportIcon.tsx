import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleProp, TextStyle, useColorScheme } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
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
  volleyball: 'volleyball',
  trail: 'run-fast',
  skiing: 'ski',
  snowboard: 'snowboard',
  golf: 'golf',
  hyrox: 'weight-lifter',
  walking: 'walk',
  gym: 'dumbbell',
  surf: 'surfing',
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
  const normalizedSport = sport?.trim().toLowerCase() || '';

  // Get icon name or fallback
  const iconName = SPORT_ICONS[normalizedSport] || 'dots-horizontal'; // Fallback for unknown sports

  // Use provided color, or sport-specific color, or default based on theme
  const iconColor = color || SPORT_COLORS[normalizedSport] || defaultColor;

  if (normalizedSport === 'running') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <Circle cx="15.2" cy="4.2" r="2" fill={iconColor} />
        <Path
          d="m13.7 7-3.2 1.7-2.2 4.1 3.1 1.6-2 5.4m1.1-10.2-3.8 1.2-2.1 3m7.1-2.9 3.5 1.8 2.1 3.2m-6.1-1.1 3.6 1.6 2.2 3.1m-5.8-4.7-3.1 2.4-2.8 3.4"
          stroke={iconColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return <MaterialCommunityIcons name={iconName} size={size} color={iconColor} style={style} />;
};
