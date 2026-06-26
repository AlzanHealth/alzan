import { ActivitySession } from '../../../types/requests.types';

export const STRONG_DUPLICATE_THRESHOLD = 80;

export type ImportReviewReason = 'duplicate' | 'strength_assignment' | 'watch_metrics' | 'new_import';
export type ImportReviewConflictReason = Exclude<ImportReviewReason, 'new_import'>;
export type ImportReviewPriority = 'blocking' | 'soft' | 'resolved';
export type ImportReviewDetailStep =
  | 'strong_duplicate'
  | 'strength_assignment'
  | 'watch_metrics'
  | 'suggested_template'
  | 'planned_routine'
  | 'template_management'
  | 'resolved';

export interface ImportReviewItem {
  session: ActivitySession;
  reason: ImportReviewReason;
  /** Hard reviews persist until resolved; soft ones clear once seen or after the window. */
  hard: boolean;
}

export interface ImportReviewDetailState {
  priority: ImportReviewPriority;
  mainStep: ImportReviewDetailStep;
  hasWeakDuplicateNotice: boolean;
  duplicateScore: number;
}

export const WATCH_METRICS_REVERT_WINDOW_HOURS = 72;
export const WATCH_METRICS_SESSION_MAX_AGE_HOURS = 168;

const hasPendingDuplicate = (session: ActivitySession): boolean =>
  session.duplicate_resolution === 'pending' && session.duplicate_of_session_id != null;

const hasStrongDuplicate = (session: ActivitySession): boolean =>
  hasPendingDuplicate(session) && (session.duplicate_score ?? 0) >= STRONG_DUPLICATE_THRESHOLD;

const hasWeakDuplicate = (session: ActivitySession): boolean =>
  hasPendingDuplicate(session) && (session.duplicate_score ?? 0) < STRONG_DUPLICATE_THRESHOLD;

const toTime = (value: Date | number): number => (value instanceof Date ? value.getTime() : value);

const parseIsoTime = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const getPendingWatchMetricsReceivedAt = (session: ActivitySession): number | null => {
  const raw = session.pending_watch_metrics;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return parseIsoTime((raw as Record<string, unknown>).received_at);
};

const hoursBetween = (from: number, to: number): number => (to - from) / (3600 * 1000);

export const hasActivePendingWatchMetrics = (session: ActivitySession, now: Date | number = Date.now()): boolean => {
  if (session.pending_watch_metrics == null) return false;
  const nowTime = toTime(now);
  const receivedAt = getPendingWatchMetricsReceivedAt(session);
  const sessionStart = parseIsoTime(session.start_time);
  if (receivedAt == null || sessionStart == null) return false;
  return (
    hoursBetween(receivedAt, nowTime) < WATCH_METRICS_REVERT_WINDOW_HOURS &&
    hoursBetween(sessionStart, nowTime) < WATCH_METRICS_SESSION_MAX_AGE_HOURS
  );
};

export const getImportReviewConflictReason = (
  session: ActivitySession,
  now: Date | number = Date.now(),
): ImportReviewConflictReason | null => {
  if (hasStrongDuplicate(session)) return 'duplicate';
  if (session.needs_strength_review) return 'strength_assignment';
  if (hasActivePendingWatchMetrics(session, now)) return 'watch_metrics';
  return null;
};

const reviewRecencyTime = (session: ActivitySession): number =>
  new Date(session.imported_at ?? session.start_time).getTime();

export const compareImportReviewRecency = (left: ActivitySession, right: ActivitySession): number =>
  reviewRecencyTime(right) - reviewRecencyTime(left);

export const sortImportReviewItems = (items: ImportReviewItem[]): ImportReviewItem[] =>
  [...items].sort((left, right) => compareImportReviewRecency(left.session, right.session));

export const getImportReviewDetailState = ({
  session,
  reviewActionCompleted,
  hasSuggestedTemplate,
  hasPlannedRoutine,
  associatedTemplateId,
  now = Date.now(),
}: {
  session: ActivitySession;
  reviewActionCompleted: boolean;
  hasSuggestedTemplate: boolean;
  hasPlannedRoutine: boolean;
  associatedTemplateId: string | null | undefined;
  now?: Date | number;
}): ImportReviewDetailState => {
  const duplicateScore = session.duplicate_score ?? 0;
  const hasWeakDuplicateNotice = !reviewActionCompleted && hasWeakDuplicate(session);

  if (reviewActionCompleted) {
    return { priority: 'resolved', mainStep: 'resolved', hasWeakDuplicateNotice: false, duplicateScore };
  }
  if (hasStrongDuplicate(session)) {
    return { priority: 'blocking', mainStep: 'strong_duplicate', hasWeakDuplicateNotice: false, duplicateScore };
  }
  if (session.needs_strength_review) {
    return { priority: 'blocking', mainStep: 'strength_assignment', hasWeakDuplicateNotice, duplicateScore };
  }
  if (hasActivePendingWatchMetrics(session, now)) {
    return { priority: 'blocking', mainStep: 'watch_metrics', hasWeakDuplicateNotice, duplicateScore };
  }
  if (!associatedTemplateId && hasSuggestedTemplate) {
    return { priority: 'soft', mainStep: 'suggested_template', hasWeakDuplicateNotice, duplicateScore };
  }
  if (!associatedTemplateId && hasPlannedRoutine) {
    return { priority: 'soft', mainStep: 'planned_routine', hasWeakDuplicateNotice, duplicateScore };
  }
  return { priority: 'resolved', mainStep: 'template_management', hasWeakDuplicateNotice, duplicateScore };
};
