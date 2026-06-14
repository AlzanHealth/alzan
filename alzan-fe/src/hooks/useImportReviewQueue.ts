import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ActivitySession } from '../types/requests.types';

const STRONG_DUPLICATE_THRESHOLD = 80;
const NEW_IMPORT_WINDOW_HOURS = 72;

export type ImportReviewReason = 'duplicate' | 'watch_conflict' | 'strength_assignment' | 'new_import';

export interface ImportReviewItem {
  session: ActivitySession;
  reason: ImportReviewReason;
  /** Hard reviews persist until resolved; soft ones clear once seen or after the window. */
  hard: boolean;
}

/** Hard, blocking review states that surface regardless of age until resolved. */
function hardReason(session: ActivitySession): ImportReviewReason | null {
  if (session.pending_watch_metrics != null) return 'watch_conflict';
  if (
    session.duplicate_resolution === 'pending' &&
    session.duplicate_of_session_id != null &&
    (session.duplicate_score ?? 0) >= STRONG_DUPLICATE_THRESHOLD
  ) {
    return 'duplicate';
  }
  if (session.needs_strength_review) return 'strength_assignment';
  return null;
}

/**
 * Prioritized review queue surfaced when the user enters Training:
 * - Hard conflicts (watch-metric conflict, strong duplicate, multiple-strength)
 *   surface for every affected activity, any age, until resolved.
 * - The single most recent imported activity not yet reviewed (< 72h) surfaces
 *   as a soft "new activity" summary (Strava-like), until opened or dismissed.
 * Soft, old signals (weak duplicate, 60-79% suggestion) never surface here.
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
          'pending_watch_metrics.not.is.null,needs_strength_review.eq.true,' +
            'and(duplicate_resolution.eq.pending,duplicate_of_session_id.not.is.null)',
        )
        .order('start_time', { ascending: false });
      if (hardError) throw hardError;

      const hardItems: ImportReviewItem[] = [];
      for (const session of hardRows ?? []) {
        const reason = hardReason(session);
        if (reason) hardItems.push({ session, reason, hard: true });
      }

      // Soft "new import": the single most recent imported activity the user
      // has not reviewed yet, within the surfacing window.
      const { data: newRows, error: newError } = await supabase
        .from('activity_sessions')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .not('imported_at', 'is', null)
        .is('import_review_seen_at', null)
        .gte('imported_at', windowStart)
        .order('imported_at', { ascending: false })
        .limit(1);
      if (newError) throw newError;

      const latestNew = newRows?.[0];
      const hardIds = new Set(hardItems.map(item => item.session.id));
      const latestNewImport: ImportReviewItem | null =
        latestNew && !hardIds.has(latestNew.id) ? { session: latestNew, reason: 'new_import', hard: false } : null;

      const items = [...hardItems];
      if (latestNewImport) items.push(latestNewImport);
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
