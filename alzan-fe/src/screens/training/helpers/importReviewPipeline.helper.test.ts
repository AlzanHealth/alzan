import assert from 'node:assert/strict';
import {
  compareImportReviewRecency,
  getImportReviewConflictReason,
  getImportReviewDetailState,
} from './importReviewPipeline.helper';
import { ActivitySession } from '../../../types/requests.types';

const session = (overrides: Partial<ActivitySession>): ActivitySession =>
  ({
    id: 'session-1',
    sport_type: 'cycling',
    start_time: '2026-06-17T08:00:00.000Z',
    status: 'completed',
    ...overrides,
  }) as ActivitySession;

assert.equal(
  getImportReviewConflictReason(
    session({ duplicate_resolution: 'pending', duplicate_of_session_id: 'existing', duplicate_score: 90 }),
  ),
  'duplicate',
);

assert.equal(
  getImportReviewConflictReason(
    session({ duplicate_resolution: 'pending', duplicate_of_session_id: 'existing', duplicate_score: 30 }),
  ),
  null,
);

assert.equal(getImportReviewConflictReason(session({ needs_strength_review: true })), 'strength_assignment');

assert.equal(
  getImportReviewConflictReason(session({ pending_watch_metrics: { previous: { duration_s: 1800 } } })),
  'watch_metrics',
);

assert.equal(
  getImportReviewDetailState({
    session: session({ duplicate_resolution: 'pending', duplicate_of_session_id: 'existing', duplicate_score: 25 }),
    reviewActionCompleted: false,
    hasSuggestedTemplate: true,
    hasPlannedRoutine: false,
    associatedTemplateId: null,
  }).mainStep,
  'suggested_template',
);

assert.equal(
  getImportReviewDetailState({
    session: session({ duplicate_resolution: 'pending', duplicate_of_session_id: 'existing', duplicate_score: 25 }),
    reviewActionCompleted: false,
    hasSuggestedTemplate: true,
    hasPlannedRoutine: false,
    associatedTemplateId: null,
  }).hasWeakDuplicateNotice,
  true,
);

assert.equal(
  getImportReviewDetailState({
    session: session({ duplicate_resolution: 'pending', duplicate_of_session_id: 'existing', duplicate_score: 95 }),
    reviewActionCompleted: false,
    hasSuggestedTemplate: true,
    hasPlannedRoutine: false,
    associatedTemplateId: null,
  }).mainStep,
  'strong_duplicate',
);

assert.equal(
  Math.sign(
    compareImportReviewRecency(
      session({ imported_at: '2026-06-17T07:00:00.000Z', start_time: '2026-06-17T10:00:00.000Z' }),
      session({ imported_at: '2026-06-17T09:00:00.000Z', start_time: '2026-06-17T06:00:00.000Z' }),
    ),
  ),
  1,
);
