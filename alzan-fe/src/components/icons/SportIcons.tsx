import React from 'react';
import { SportIcon, type SportIconProps } from './SportIcon';

type IconProps = Omit<SportIconProps, 'sport'>;

const createSportIcon =
  (sport: string): React.FC<IconProps> =>
  props => <SportIcon sport={sport} {...props} />;

export const RunnerIcon = createSportIcon('running');
export const LifterIcon = createSportIcon('gym');
export const CyclistIcon = createSportIcon('cycling');
export const SwimmerIcon = createSportIcon('swimming');
export const HikerIcon = createSportIcon('hiking');
export const FootballPlayerIcon = createSportIcon('football');
export const BasketballPlayerIcon = createSportIcon('basketball');
export const TennisPlayerIcon = createSportIcon('tennis');

export const SPORT_ICONS = {
  running: RunnerIcon,
  gym: LifterIcon,
  cycling: CyclistIcon,
  swimming: SwimmerIcon,
  hiking: HikerIcon,
  football: FootballPlayerIcon,
  basketball: BasketballPlayerIcon,
  tennis: TennisPlayerIcon,
};
