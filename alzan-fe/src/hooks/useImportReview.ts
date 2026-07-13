import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityImportReview } from '../openapi/generated/alzan-be/sdk.gen';
import { invalidateTrainingCalendar } from '../lib/trainingQueryKeys';

interface ReviewActionTarget {
  targetSessionId?: string;
}

/**
 * Mutations for the imported-activity review actions (template association,
 * duplicate merge / keep-both, watch-metric conflicts and strength
 * assignment). All of them resolve to the surviving session id.
 */
export const useImportReview = (sessionId?: string) => {
  const queryClient = useQueryClient();

  const invalidate = (nextSessionId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
    invalidateTrainingCalendar(queryClient);
    queryClient.invalidateQueries({ queryKey: ['importReviewQueue'] });
    queryClient.invalidateQueries({ queryKey: ['importReviewAssociatedTemplate'] });
    queryClient.invalidateQueries({ queryKey: ['importReviewSuggestedTemplate'] });
    queryClient.invalidateQueries({ queryKey: ['sessionDetail'] });
    queryClient.invalidateQueries({ queryKey: ['sessionLaps'] });
    queryClient.invalidateQueries({ queryKey: ['sessionHeartRateZones'] });
    if (sessionId) {
      queryClient.invalidateQueries({ queryKey: ['activitySession', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['enduranceTemplateDetail'] });
    }
    if (nextSessionId && nextSessionId !== sessionId) {
      queryClient.invalidateQueries({ queryKey: ['activitySession', nextSessionId] });
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
      workoutPlanId,
      targetSessionId,
    }: {
      enduranceTemplateId?: string | null;
      workoutTemplateId?: string | null;
      workoutPlanId?: string;
    } & ReviewActionTarget) => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(
        ActivityImportReview.associateTemplate({
          path: { id: sessionId },
          body: {
            endurance_template_id: enduranceTemplateId ?? null,
            workout_template_id: workoutTemplateId ?? null,
            workout_plan_id: workoutPlanId,
            target_session_id: targetSessionId,
          },
        }),
      );
    },
    onSuccess: invalidate,
  });

  const dismissSuggestion = useMutation({
    mutationFn: ({ targetSessionId }: ReviewActionTarget = {}) => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(
        ActivityImportReview.dismissSuggestion({
          path: { id: sessionId },
          body: { target_session_id: targetSessionId },
        }),
      );
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
    mutationFn: ({ targetSessionId }: ReviewActionTarget = {}) => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(
        ActivityImportReview.keepBothDuplicates({
          path: { id: sessionId },
          body: { target_session_id: targetSessionId },
        }),
      );
    },
    onSuccess: invalidate,
  });

  // Watch values are applied by default; this reverts to the user's previous values.
  const revertWatchMetrics = useMutation({
    mutationFn: ({ targetSessionId }: ReviewActionTarget = {}) => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(
        ActivityImportReview.revertWatchMetrics({
          path: { id: sessionId },
          body: { target_session_id: targetSessionId },
        }),
      );
    },
    onSuccess: invalidate,
  });

  // Keeps the watch values (default) and clears the revert notice.
  const keepWatchMetrics = useMutation({
    mutationFn: ({ targetSessionId }: ReviewActionTarget = {}) => {
      if (!sessionId) throw new Error('SESSION_REQUIRED');
      return run(
        ActivityImportReview.keepWatchMetrics({
          path: { id: sessionId },
          body: { target_session_id: targetSessionId },
        }),
      );
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
