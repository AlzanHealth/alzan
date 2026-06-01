import React from 'react';
import { SportIcon } from '../components/icons/SportIcon';
import { SportIconProps } from '../components/icons/SportIcon';
import { SportType } from '../types/requests.types';
import { TranslationKey } from '../i18n/locales/en';

// Create wrapper components for each sport that use SportIcon
const RunningIcon = (props: SportIconProps) => <SportIcon {...props} sport="running" />;
const CyclingIcon = (props: SportIconProps) => <SportIcon {...props} sport="cycling" />;
const SwimmingIcon = (props: SportIconProps) => <SportIcon {...props} sport="swimming" />;
const HikingIcon = (props: SportIconProps) => <SportIcon {...props} sport="hiking" />;
const FootballIcon = (props: SportIconProps) => <SportIcon {...props} sport="football" />;
const BasketballIcon = (props: SportIconProps) => <SportIcon {...props} sport="basketball" />;
const TennisIcon = (props: SportIconProps) => <SportIcon {...props} sport="tennis" />;
const OtherIcon = (props: SportIconProps) => <SportIcon {...props} sport="other" />;
const PadelIcon = (props: SportIconProps) => <SportIcon {...props} sport="padel" />;
const MartialArtsIcon = (props: SportIconProps) => <SportIcon {...props} sport="martial_arts" />;
const ClimbingIcon = (props: SportIconProps) => <SportIcon {...props} sport="climbing" />;
const SurfIcon = (props: SportIconProps) => <SportIcon {...props} sport="surf" />;
const VolleyballIcon = (props: SportIconProps) => <SportIcon {...props} sport="volleyball" />;
const TrailIcon = (props: SportIconProps) => <SportIcon {...props} sport="trail" />;

export type SportConfig = {
  id: SportType;
  label: TranslationKey;
  icon: React.FC<SportIconProps>; // SportIcon wrapper component
  units: {
    distance?: 'km' | 'm';
    speed?: 'km/h' | 'min/km' | 'min/100m';
  };
  fields: {
    distance: boolean;
    duration: boolean;
    elevation: boolean;
    calories: boolean;
    rpe: boolean;
    heartRate: boolean;
    steps?: boolean; // For future
    strokes?: boolean; // For rowing/swimming
  };
  defaultTitle: TranslationKey;
};

export const SPORTS_CONFIG: Record<string, SportConfig> = {
  running: {
    id: 'running',
    label: 'constants.running',
    icon: RunningIcon,
    units: { distance: 'km', speed: 'min/km' },
    fields: { distance: true, duration: true, elevation: true, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.runningTitle',
  },
  cycling: {
    id: 'cycling',
    label: 'constants.cycling',
    icon: CyclingIcon,
    units: { distance: 'km', speed: 'km/h' },
    fields: { distance: true, duration: true, elevation: true, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.cyclingTitle',
  },
  swimming: {
    id: 'swimming',
    label: 'constants.swimming',
    icon: SwimmingIcon,
    units: { distance: 'm', speed: 'min/100m' },
    fields: { distance: true, duration: true, elevation: false, calories: true, rpe: true, heartRate: false },
    defaultTitle: 'constants.swimmingTitle',
  },
  hiking: {
    id: 'hiking',
    label: 'constants.hiking',
    icon: HikingIcon,
    units: { distance: 'km', speed: 'min/km' },
    fields: { distance: true, duration: true, elevation: true, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.hikingTitle',
  },
  martial_arts: {
    id: 'martial_arts',
    label: 'constants.martialArts',
    icon: MartialArtsIcon,
    units: {},
    fields: { distance: false, duration: true, elevation: false, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.martialArtsTitle',
  },
  climbing: {
    id: 'climbing',
    label: 'constants.climbing',
    icon: ClimbingIcon,
    units: {},
    fields: { distance: false, duration: true, elevation: false, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.climbingTitle',
  },
  volleyball: {
    id: 'volleyball' as SportType,
    label: 'constants.volleyball',
    icon: VolleyballIcon,
    units: {},
    fields: { distance: false, duration: true, elevation: false, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.volleyballTitle',
  },
  trail: {
    id: 'trail' as SportType,
    label: 'constants.trail',
    icon: TrailIcon,
    units: { distance: 'km', speed: 'min/km' },
    fields: { distance: true, duration: true, elevation: false, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.trailTitle',
  },
  football: {
    id: 'football',
    label: 'constants.football',
    icon: FootballIcon,
    units: { distance: 'km', speed: 'min/km' },
    fields: { distance: true, duration: true, elevation: false, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.footballTitle',
  },
  basketball: {
    id: 'basketball',
    label: 'constants.basketball',
    icon: BasketballIcon,
    units: { distance: 'km', speed: 'min/km' },
    fields: { distance: true, duration: true, elevation: false, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.basketballTitle',
  },
  tennis: {
    id: 'tennis',
    label: 'constants.tennis',
    icon: TennisIcon,
    units: { distance: 'km', speed: 'min/km' },
    fields: { distance: true, duration: true, elevation: false, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.tennisTitle',
  },
  other: {
    id: 'other',
    label: 'constants.other',
    icon: OtherIcon,
    units: { distance: 'km', speed: 'min/km' },
    fields: { distance: true, duration: true, elevation: false, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.otherTitle',
  },
  padel: {
    id: 'padel',
    label: 'constants.padel',
    icon: PadelIcon,
    units: { distance: 'km', speed: 'min/km' },
    fields: { distance: true, duration: true, elevation: false, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.padelTitle',
  },
  gym: {
    id: 'gym',
    label: 'constants.gym',
    icon: OtherIcon,
    units: {},
    fields: { distance: false, duration: true, elevation: false, calories: true, rpe: true, heartRate: false },
    defaultTitle: 'constants.gymTitle',
  },
  surf: {
    id: 'surf',
    label: 'constants.surf',
    icon: SurfIcon,
    units: { distance: 'km' },
    fields: { distance: true, duration: true, elevation: false, calories: true, rpe: true, heartRate: true },
    defaultTitle: 'constants.surfTitle',
  },
};

export const SPORT_GOALS: Partial<Record<SportType | 'volleyball' | 'trail', string[]>> = {
  running: ['5 km', '10 km', '15 km', '21 km', '42 km'],
  cycling: ['50 km', '80 km', '100 km', '180 km', '250 km'],
  swimming: ['400 m', '800 m', '1500 m', '1900 m', '3800 m'],
  // Default fallback for others
  football: [],
  basketball: [],
  tennis: [],
  padel: ['1 set', '2 sets', '3 sets'],
  hiking: [],
  martial_arts: [],
  climbing: [],
  volleyball: [],
  trail: [],
  other: [],
  strength: [],
  gym: [],
  surf: [],
};

export const formatDuration = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const calculatePace = (distanceM: number, durationS: number, sport: string): string => {
  if (distanceM <= 0 || durationS <= 0) return '-';

  if (sport === 'cycling') {
    // km/h for cycling
    const distanceKm = distanceM / 1000;
    const hours = durationS / 3600;
    return `${(distanceKm / hours).toFixed(1)} km/h`;
  } else if (sport === 'swimming') {
    // min/100m for swimming
    const hundreds = distanceM / 100;
    const totalMins = durationS / 60;
    const pace = totalMins / hundreds;
    const mins = Math.floor(pace);
    const secs = Math.round((pace - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')} /100m`;
  } else {
    // min/km for all other distance-based sports (running, hiking, football, etc)
    const distanceKm = distanceM / 1000;
    const totalMins = durationS / 60;
    const pace = totalMins / distanceKm;
    const mins = Math.floor(pace);
    const secs = Math.round((pace - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')} /km`;
  }
};
