import React from 'react';
import { Activity, Dumbbell, Footprints } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import {
  mdiRun,
  mdiBike,
  mdiSwim,
  mdiSoccer,
  mdiBasketballHoop,
  mdiTennis,
  mdiHiking,
  mdiKarate,
  mdiTerrain,
  mdiVolleyball,
  mdiSurfing,
  mdiSki,
  mdiSnowboard,
  mdiGolf,
  mdiWeightLifter,
} from '@mdi/js';
import { StyleProp, useColorScheme, ViewStyle } from 'react-native';
import { SPORT_COLORS } from '../../theme/sportColors';

const SPORT_ICONS: Record<string, string> = {
  running: mdiRun,
  cycling: mdiBike,
  swimming: mdiSwim,
  football: mdiSoccer,
  basketball: mdiBasketballHoop,
  tennis: mdiTennis,
  padel: mdiTennis,
  hiking: mdiHiking,
  martial_arts: mdiKarate,
  climbing: mdiTerrain,
  volleyball: mdiVolleyball,
  surf: mdiSurfing,
  skiing: mdiSki,
  snowboard: mdiSnowboard,
  golf: mdiGolf,
  hyrox: mdiWeightLifter,
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
  const iconPath = SPORT_ICONS[normalizedSport];
  const Icon = ['gym', 'strength'].includes(normalizedSport)
    ? Dumbbell
    : ['trail', 'walking'].includes(normalizedSport)
      ? Footprints
      : Activity;
  const defaultColor = systemColorScheme === 'dark' ? '#FFFFFF' : '#333333';
  const iconColor = color || SPORT_COLORS[normalizedSport] || defaultColor;

  if (iconPath) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
        <Path d={iconPath} fill={iconColor} />
      </Svg>
    );
  }

  return <Icon size={size} color={iconColor} strokeWidth={strokeWidth} style={style} />;
};
