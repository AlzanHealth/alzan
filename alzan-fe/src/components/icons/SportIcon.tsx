import React from 'react';
import {
  Activity,
  Bike,
  CircleDot,
  Dumbbell,
  Flag,
  Footprints,
  Goal,
  Mountain,
  MountainSnow,
  Route,
  Snowflake,
  Swords,
  Volleyball,
  Waves,
  type LucideIcon,
} from 'lucide-react-native';
import { StyleProp, useColorScheme, ViewStyle } from 'react-native';
import { SPORT_COLORS } from '../../theme/sportColors';

const SPORT_ICONS: Record<string, LucideIcon> = {
  running: Footprints,
  cycling: Bike,
  swimming: Waves,
  football: Goal,
  basketball: CircleDot,
  tennis: CircleDot,
  padel: CircleDot,
  hiking: Mountain,
  trail: Route,
  martial_arts: Swords,
  climbing: Mountain,
  volleyball: Volleyball,
  surf: Waves,
  skiing: MountainSnow,
  snowboard: Snowflake,
  golf: Flag,
  hyrox: Dumbbell,
  gym: Dumbbell,
  strength: Dumbbell,
  walking: Footprints,
  other: Activity,
};

export interface SportIconProps {
  sport: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}

export const SportIcon: React.FC<SportIconProps> = ({ sport, size = 24, color, strokeWidth = 2, style }) => {
  const systemColorScheme = useColorScheme();
  const normalizedSport = sport?.trim().toLowerCase() || '';
  const Icon = SPORT_ICONS[normalizedSport] || Activity;
  const defaultColor = systemColorScheme === 'dark' ? '#FFFFFF' : '#333333';
  const iconColor = color || SPORT_COLORS[normalizedSport] || defaultColor;

  return <Icon size={size} color={iconColor} strokeWidth={strokeWidth} style={style} />;
};
