import React from 'react';
import { Activity, Dumbbell, Footprints } from 'lucide-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { StyleProp, useColorScheme, ViewStyle } from 'react-native';
import { SPORT_COLORS } from '../../theme/sportColors';

type SportGlyph = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const SPORT_ICONS: Record<string, SportGlyph> = {
  running: 'run',
  cycling: 'bike',
  swimming: 'swim',
  football: 'soccer',
  basketball: 'basketball-hoop',
  tennis: 'tennis',
  padel: 'tennis',
  hiking: 'hiking',
  martial_arts: 'karate',
  climbing: 'terrain',
  volleyball: 'volleyball',
  surf: 'surfing',
  skiing: 'ski',
  snowboard: 'snowboard',
  golf: 'golf',
  hyrox: 'weight-lifter',
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
  const [fontsLoaded] = useFonts(MaterialCommunityIcons.font);
  const iconName = SPORT_ICONS[normalizedSport];
  const Icon = ['gym', 'strength'].includes(normalizedSport)
    ? Dumbbell
    : ['trail', 'walking'].includes(normalizedSport)
      ? Footprints
      : Activity;
  const defaultColor = systemColorScheme === 'dark' ? '#FFFFFF' : '#333333';
  const iconColor = color || SPORT_COLORS[normalizedSport] || defaultColor;

  if (iconName && fontsLoaded) {
    return <MaterialCommunityIcons name={iconName} size={size} color={iconColor} style={style} />;
  }

  return <Icon size={size} color={iconColor} strokeWidth={strokeWidth} style={style} />;
};
