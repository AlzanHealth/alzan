import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityImportReview } from '../openapi/generated/alzan-be/sdk.gen';

/**
 * Mutations for the imported-activity review actions (template association,
 * duplicate merge / keep-both, watch-metric conflicts and strength
 * assignment). All of them resolve to the surviving session id.
 */
export const useImportReview = (sessionId?: string) => {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
    queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
    queryClient.invalidateQueries({ queryKey: ['weekDots'] });
    queryClient.invalidateQueries({ queryKey: ['sessionDetail'] });
    queryClient.invalidateQueries({ queryKey: ['sessionLaps'] });
    queryClient.invalidateQueries({ queryKey: ['sessionHeartRateZones'] });
    if (sessionId) {
      queryClient.invalidateQueries({ queryKey: ['activitySession', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['enduranceTemplateDetail'] });
    }
  };

  const run = async (promise: Promise<{ data?: { session_id: string } | undefined }>): Promise<string> => {
    const { data } = await promise;
    if (!data?.session_id) throw new Error('IMPORT_REVIEW_ACTION_FAILED');
    return data.session_id;
  };

  const associateTemplate = useMutation({
    mutationFn: ({
      enduranceTemplateId,
      workoutTemplateId,
    }: {
      enduranceTemplateId?: string | null;
      workoutTemplateId?: string | null;
    }) => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(
        ActivityImportReview.associateTemplate({
          path: { id: sessionId },
          body: {
            endurance_template_id: enduranceTemplateId ?? null,
            workout_template_id: workoutTemplateId ?? null,
          },
        }),
      );
    },
    onSuccess: invalidate,
  });

  const dismissSuggestion = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(ActivityImportReview.dismissSuggestion({ path: { id: sessionId } }));
    },
    onSuccess: invalidate,
  });

  const mergeDuplicate = useMutation({
    mutationFn: ({ targetSessionId }: { targetSessionId?: string } = {}) => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(
        ActivityImportReview.mergeDuplicate({
          path: { id: sessionId },
          body: { target_session_id: targetSessionId },
        }),
      );
    },
    onSuccess: invalidate,
  });

  const keepBothDuplicates = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(ActivityImportReview.keepBothDuplicates({ path: { id: sessionId } }));
    },
    onSuccess: invalidate,
  });

  // Watch values are applied by default; this reverts to the user's previous values.
  const revertWatchMetrics = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(ActivityImportReview.revertWatchMetrics({ path: { id: sessionId } }));
    },
    onSuccess: invalidate,
  });

  // Keeps the watch values (default) and clears the revert notice.
  const keepWatchMetrics = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(ActivityImportReview.keepWatchMetrics({ path: { id: sessionId } }));
    },
    onSuccess: invalidate,
  });

  const assignStrengthSession = useMutation({
    mutationFn: ({ targetSessionId }: { targetSessionId?: string } = {}) => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(
        ActivityImportReview.assignStrengthSession({
          path: { id: sessionId },
          body: { target_session_id: targetSessionId },
        }),
      );
    },
    onSuccess: invalidate,
  });

  return {
    associateTemplate,
    dismissSuggestion,
    mergeDuplicate,
    keepBothDuplicates,
    revertWatchMetrics,
    keepWatchMetrics,
    assignStrengthSession,
  };
};
