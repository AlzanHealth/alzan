import { QueryClient } from '@tanstack/react-query';

export const trainingQueryKeys = {
  runningShoes: ['runningShoes'] as const,
  dailyPlans: ['dailyPlans'] as const,
  completedSessions: ['completedSessions'] as const,
  dashboard: ['dashboard'] as const,
  weekDots: ['weekDots'] as const,
  weeklyPlans: ['weeklyPlans'] as const,
  calendarDots: ['calendarDots'] as const,
  scheduledWorkoutPreview: ['scheduledWorkoutPreview'] as const,
};

export const enduranceTemplatesQueryKey = ['enduranceTemplates'] as const;

export function invalidateEnduranceTemplates(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: enduranceTemplatesQueryKey });
}

export function invalidateTrainingCalendar(queryClient: QueryClient): void {
  for (const queryKey of Object.values(trainingQueryKeys)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
