import { QueryClient } from '@tanstack/react-query';

export const trainingQueryKeys = {
  dailyPlans: ['dailyPlans'] as const,
  completedSessions: ['completedSessions'] as const,
  dashboard: ['dashboard'] as const,
  weekDots: ['weekDots'] as const,
  weeklyPlans: ['weeklyPlans'] as const,
  calendarDots: ['calendarDots'] as const,
  scheduledWorkoutPreview: ['scheduledWorkoutPreview'] as const,
};

export function invalidateTrainingCalendar(queryClient: QueryClient): void {
  for (const queryKey of Object.values(trainingQueryKeys)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
