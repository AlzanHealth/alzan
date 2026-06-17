import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
  getImportReviewConflictReason,
  sortImportReviewItems,
  type ImportReviewItem,
} from '../screens/training/helpers/importReviewPipeline.helper';

const NEW_IMPORT_WINDOW_HOURS = 168; // 7 days (7 * 24 hours)

export type { ImportReviewItem, ImportReviewReason } from '../screens/training/helpers/importReviewPipeline.helper';

/**
 * Prioritized review queue surfaced when the user enters Training:
 * - Hard conflicts (strong duplicate, multiple-strength, watch metrics) surface
 *   one at a time, any age, until resolved.
 * - The single most recent imported activity not yet reviewed (< 7 days) surfaces
 *   as a soft "new activity" summary (Strava-like), until opened or dismissed.
 * Soft signals (weak duplicate, 60-79% suggestion) never surface here; they
 * live inside the activity detail.
 */
export const useImportReviewQueue = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['importReviewQueue', user?.id],
    queryFn: async (): Promise<{ items: ImportReviewItem[]; latestNewImport: ImportReviewItem | null }> => {
      if (!user) return { items: [], latestNewImport: null };
      const windowStart = new Date(Date.now() - NEW_IMPORT_WINDOW_HOURS * 3600 * 1000).toISOString();

      // Hard reviews: any imported/owned session in a blocking state.
      const { data: hardRows, error: hardError } = await supabase
        .from('activity_sessions')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .or(
          'needs_strength_review.eq.true,pending_watch_metrics.not.is.null,and(duplicate_resolution.eq.pending,duplicate_of_session_id.not.is.null)',
        );
      if (hardError) throw hardError;

      const hardItems: ImportReviewItem[] = [];
      for (const session of hardRows ?? []) {
        const reason = getImportReviewConflictReason(session);
        if (reason) hardItems.push({ session, reason, hard: true });
      }

      // Soft/hard "new import" candidate: the last activity loaded in the last 7 days.
      // If there are multiple, prioritize conflicts (hard conflicts), otherwise the absolute last import.
      const { data: recentImports, error: recentError } = await supabase
        .from('activity_sessions')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .not('imported_at', 'is', null)
        .gte('imported_at', windowStart)
        .order('imported_at', { ascending: false });
      if (recentError) throw recentError;

      let latestNewImport: ImportReviewItem | null = null;
      if (recentImports && recentImports.length > 0) {
        // Find if there is any conflict in the recent imports
        const conflictImports = recentImports.filter(session => {
          const reason = getImportReviewConflictReason(session);
          return reason !== null;
        });

        // The target session is the latest conflict if any exists, else the absolute latest import
        const targetSession = conflictImports.length > 0 ? conflictImports[0] : recentImports[0];

        // Only auto-open if it has not been marked seen yet
        if (targetSession.import_review_seen_at === null) {
          const reason = getImportReviewConflictReason(targetSession) ?? 'new_import';
          latestNewImport = {
            session: targetSession,
            reason,
            hard: reason !== 'new_import',
          };
        }
      }

      const items = sortImportReviewItems(hardItems);
      if (latestNewImport && latestNewImport.reason === 'new_import') {
        items.push(latestNewImport);
      }
      return { items, latestNewImport };
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  });

  /** Marks an imported activity's review summary as acknowledged. */
  const markSeen = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('activity_sessions')
        .update({ import_review_seen_at: new Date().toISOString() })
        .eq('id', sessionId)
        .is('import_review_seen_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['importReviewQueue'] });
    },
  });

  const items = query.data?.items ?? [];
  const latestNewImport = query.data?.latestNewImport ?? null;
  // Top of the banner: hard conflicts first (most recent), else the new import.
  const topItem = items.find(item => item.hard) ?? latestNewImport;

  return { items, latestNewImport, topItem, isLoading: query.isLoading, markSeen };
};
