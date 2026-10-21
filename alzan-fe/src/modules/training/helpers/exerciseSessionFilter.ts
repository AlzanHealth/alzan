export const isStrengthExerciseSession = (sportType: string | null | undefined): boolean =>
  !sportType || sportType === 'strength' || sportType === 'gym';
