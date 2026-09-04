import React from 'react';
import { Text, TextStyle } from 'react-native';

interface WorkoutDurationTimerProps {
  seconds: number;
  style?: TextStyle | TextStyle[];
}

export const WorkoutDurationTimer: React.FC<WorkoutDurationTimerProps> = ({ seconds, style }) => {
  const formatTime = (totalSeconds: number) => {
    const normalizedSeconds = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(normalizedSeconds / 3600);
    const minutes = Math.floor((normalizedSeconds % 3600) / 60);
    const seconds = normalizedSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return <Text style={style}>{formatTime(seconds)}</Text>;
};
