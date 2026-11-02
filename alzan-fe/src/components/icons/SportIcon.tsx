import React from 'react';
import { Activity, Dumbbell, Footprints } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { StyleProp, useColorScheme, ViewStyle } from 'react-native';
import { MATERIAL_DESIGN_SPORT_PATHS } from './materialDesignSportPaths';
import { SPORT_COLORS } from '../../theme/sportColors';

const SPORT_ICONS: Record<string, string> = {
  running: MATERIAL_DESIGN_SPORT_PATHS.running,
  cycling: MATERIAL_DESIGN_SPORT_PATHS.cycling,
  swimming: MATERIAL_DESIGN_SPORT_PATHS.swimming,
  football: MATERIAL_DESIGN_SPORT_PATHS.football,
  basketball: MATERIAL_DESIGN_SPORT_PATHS.basketball,
  tennis: MATERIAL_DESIGN_SPORT_PATHS.tennis,
  padel: MATERIAL_DESIGN_SPORT_PATHS.tennis,
  hiking: MATERIAL_DESIGN_SPORT_PATHS.hiking,
  martial_arts: MATERIAL_DESIGN_SPORT_PATHS.martialArts,
  climbing: MATERIAL_DESIGN_SPORT_PATHS.climbing,
  volleyball: MATERIAL_DESIGN_SPORT_PATHS.volleyball,
  surf: MATERIAL_DESIGN_SPORT_PATHS.surf,
  skiing: MATERIAL_DESIGN_SPORT_PATHS.skiing,
  snowboard: MATERIAL_DESIGN_SPORT_PATHS.snowboard,
  golf: MATERIAL_DESIGN_SPORT_PATHS.golf,
  hyrox: MATERIAL_DESIGN_SPORT_PATHS.hyrox,
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
