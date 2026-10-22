export const healthQueryKeys = {
  all: (userId: string | undefined) => ['health', userId] as const,
  weights: (userId: string | undefined, limit: number) => ['health', userId, 'weights', limit] as const,
  composition: (userId: string | undefined, limit: number) => ['health', userId, 'composition', limit] as const,
  measurements: (userId: string | undefined, type: string | undefined, limit: number, protocol?: string | null) =>
    ['health', userId, 'measurements', type, limit, protocol] as const,
  sleepSessions: (userId: string | undefined) => ['health', userId, 'sleep-sessions'] as const,
  sleepSession: (userId: string | undefined, sessionId: string | null) =>
    ['health', userId, 'sleep-sessions', sessionId] as const,
  restingHeartRate: (userId: string | undefined) => ['health', userId, 'resting-heart-rate'] as const,
  profile: (userId: string | undefined) => ['health', userId, 'profile'] as const,
  steps: (userId: string | undefined) => ['health', userId, 'steps'] as const,
};
