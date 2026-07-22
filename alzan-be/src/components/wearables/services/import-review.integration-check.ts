/**
 * Integration check for the import-review user-decision branches against a
 * local Supabase instance. NOT part of the hermetic verify suite (it needs a
 * running local DB + service role). Run manually:
 *
 *   cd alzan-be && node -r ts-node/register -r tsconfig-paths/register \
 *     src/components/wearables/services/import-review.integration-check.ts
 *
 * It seeds disposable sessions for a temporary user, exercises every decision
 * branch (merge / keep-both / do-nothing / revert / keep / assign / keep-as-new)
 * and asserts the resulting DB state never loses data or leaves duplicates,
 * then cleans everything up.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { strict as assert } from 'assert';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ImportReconciliationService } from './import-reconciliation.service';
import { ImportReviewService } from './import-review.service';
import { RawPayloadService } from './raw-payload.service';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { DedupeService } from './dedupe.service';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { CanonicalActivity } from '../../activity-import/parsers/activity-import-canonical.types';

config({ path: resolve(__dirname, '../../../../.env') });

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

async function main(): Promise<void> {
  if (!url || !serviceKey) {
    console.log('[skip] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return;
  }
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    console.log(`[skip] refusing to run against non-local Supabase (${url})`);
    return;
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false } }) as SupabaseClient;
  const adminStub = { client } as unknown as SupabaseAdminService;
  const rawPayload = new RawPayloadService(adminStub);
  const reconciliation = new ImportReconciliationService(adminStub);
  const review = new ImportReviewService(adminStub, rawPayload, reconciliation);
  const writer = new CanonicalActivityWriterService(adminStub, rawPayload, new DedupeService(), reconciliation);

  const email = `import-review-check+${Date.now()}@example.com`;
  const { data: created, error: userError } = await client.auth.admin.createUser({
    email,
    password: 'Test1234!pass',
    email_confirm: true,
  });
  if (userError || !created.user) throw new Error(`createUser failed: ${userError?.message}`);
  const userId = created.user.id;
  const createdSessionIds = new Set<string>();
  const createdTemplateIds = new Set<string>();
  const createdPlanIds = new Set<string>();

  const insertSession = async (overrides: Record<string, unknown>): Promise<string> => {
    const { data, error } = await client
      .from('activity_sessions')
      .insert({
        user_id: userId,
        status: 'completed',
        start_time: '2026-06-12T08:00:00Z',
        source: 'manual',
        ...overrides,
      })
      .select('id')
      .single();
    if (error) throw new Error(`insert session failed: ${error.message}`);
    createdSessionIds.add(data.id);
    return data.id;
  };

  const getSession = async (id: string) => {
    const { data } = await client.from('activity_sessions').select('*').eq('id', id).maybeSingle();
    return data;
  };
  const exists = async (id: string): Promise<boolean> => (await getSession(id)) != null;

  let exerciseId: string | null = null;
  const { data: exRow } = await client.from('exercises').select('id').limit(1).maybeSingle();
  exerciseId = exRow?.id ?? null;

  const results: string[] = [];
  const pass = (name: string) => results.push(`[PASS] ${name}`);

  try {
    // --- Endurance MERGE: existing survives, imported deleted, laps moved ---
    {
      const existing = await insertSession({
        sport_type: 'running',
        distance_m: 10000,
        duration_s: 3000,
        name: 'Morning run',
      });
      const imported = await insertSession({
        sport_type: 'running',
        distance_m: 10050,
        duration_s: 3010,
        provider: 'suunto',
        provider_activity_id: `run-${Date.now()}`,
        source: 'imported',
        imported_at: new Date().toISOString(),
        duplicate_of_session_id: existing,
        duplicate_score: 95,
        duplicate_resolution: 'pending',
      });
      await client.from('activity_laps').insert({
        session_id: imported,
        user_id: userId,
        lap_index: 0,
        lap_type: 'manual',
        split_group: 'custom',
        split_group_order: 0,
        distance_m: 10050,
        duration_s: 3010,
      });
      await client.from('activity_route_points').insert({
        session_id: imported,
        user_id: userId,
        point_index: 0,
        lat: 39.47,
        lon: -0.37,
        source: 'wearable_import',
      });
      const survivorId = await review.mergeDuplicate(userId, imported);
      assert.equal(survivorId, existing, 'survivor must be the existing session');
      assert.equal(await exists(imported), false, 'imported session must be deleted after merge');
      assert.equal(await exists(existing), true, 'existing session must survive');
      const survivor = await getSession(existing);
      assert.equal(survivor.duplicate_resolution, 'merged');
      assert.equal(survivor.provider, 'suunto', 'watch provenance applied to survivor');
      const { count: lapCount } = await client
        .from('activity_laps')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', existing);
      assert.ok((lapCount ?? 0) >= 1, 'imported laps moved onto survivor (none lost)');
      const { count: orphanLaps } = await client
        .from('activity_laps')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', imported);
      assert.equal(orphanLaps ?? 0, 0, 'no laps left on deleted session');
      const { count: routePointCount } = await client
        .from('activity_route_points')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', existing);
      assert.equal(routePointCount ?? 0, 1, 'imported route points moved onto survivor');
      pass('endurance merge: existing survives, artifacts moved, imported deleted');
    }

    // --- Endurance AUTO-MERGE: strong pending duplicate is absorbed without user action ---
    {
      const existing = await insertSession({
        sport_type: 'running',
        distance_m: 8020,
        duration_s: 2488,
        name: 'Carrera',
      });
      const imported = await insertSession({
        sport_type: 'running',
        distance_m: 8000,
        duration_s: 2488,
        start_time: '2026-06-12T09:09:00Z',
        provider: 'suunto',
        provider_activity_id: `auto-run-${Date.now()}`,
        source: 'imported',
        imported_at: new Date().toISOString(),
        duplicate_of_session_id: existing,
        duplicate_score: 80,
        duplicate_resolution: 'pending',
      });
      const survivorId = await review.autoMergeDuplicateIfStrong(userId, imported);
      assert.equal(survivorId, existing, 'strong duplicate auto-merge keeps existing session');
      assert.equal(await exists(imported), false, 'auto-merged imported duplicate is deleted');
      assert.equal(await exists(existing), true, 'existing session survives auto-merge');
      pass('endurance auto-merge: strong imported duplicate absorbed safely');
    }

    // --- Endurance WEAK DUPLICATE: stays reviewable/generic ---
    {
      const existing = await insertSession({ sport_type: 'running', distance_m: 5000, duration_s: 1500 });
      const imported = await insertSession({
        sport_type: 'running',
        distance_m: 10000,
        duration_s: 3000,
        source: 'imported',
        imported_at: new Date().toISOString(),
        duplicate_of_session_id: existing,
        duplicate_score: 50,
        duplicate_resolution: 'pending',
      });
      const survivorId = await review.autoMergeDuplicateIfStrong(userId, imported);
      assert.equal(survivorId, null, 'weak duplicate is not auto-merged');
      assert.equal(await exists(existing), true);
      assert.equal(await exists(imported), true);
      pass('endurance weak duplicate: not auto-merged');
    }

    // --- Endurance KEEP BOTH: both survive ---
    {
      const existing = await insertSession({ sport_type: 'cycling', distance_m: 20000, duration_s: 3600 });
      const imported = await insertSession({
        sport_type: 'cycling',
        distance_m: 20100,
        duration_s: 3620,
        source: 'imported',
        imported_at: new Date().toISOString(),
        duplicate_of_session_id: existing,
        duplicate_score: 90,
        duplicate_resolution: 'pending',
      });
      await review.keepBothDuplicates(userId, imported);
      assert.equal(await exists(existing), true);
      assert.equal(await exists(imported), true, 'keep both keeps the new session');
      const kept = await getSession(imported);
      assert.equal(kept.duplicate_resolution, 'kept_both');
      pass('endurance keep both: both sessions survive');
    }

    // --- Endurance DO NOTHING: pending stays, both survive ---
    {
      const existing = await insertSession({ sport_type: 'swimming', distance_m: 2000, duration_s: 2400 });
      const imported = await insertSession({
        sport_type: 'swimming',
        distance_m: 2000,
        duration_s: 2410,
        source: 'imported',
        imported_at: new Date().toISOString(),
        duplicate_of_session_id: existing,
        duplicate_score: 92,
        duplicate_resolution: 'pending',
      });
      // user does nothing
      assert.equal(await exists(existing), true);
      assert.equal(await exists(imported), true);
      const still = await getSession(imported);
      assert.equal(still.duplicate_resolution, 'pending', 'do-nothing leaves it pending (keeps surfacing)');
      pass('endurance do-nothing: both survive, stays pending');
    }

    // --- Endurance DEFER SUGGESTION: preserve, reset on change/link, never duplicate ---
    {
      const firstTemplateId = randomUUID();
      const secondTemplateId = randomUUID();
      createdTemplateIds.add(firstTemplateId);
      createdTemplateIds.add(secondTemplateId);
      const { error: templateError } = await client.from('endurance_workout_templates').insert([
        {
          id: firstTemplateId,
          user_id: userId,
          base_name: 'Deferred suggestion A',
          sport_type: 'running',
        },
        {
          id: secondTemplateId,
          user_id: userId,
          base_name: 'Deferred suggestion B',
          sport_type: 'running',
        },
      ]);
      if (templateError) throw new Error(`insert deferred templates failed: ${templateError.message}`);
      const sessionId = await insertSession({
        sport_type: 'running',
        suggested_endurance_template_id: firstTemplateId,
        template_match_score: 79,
        template_match_method: 'structural',
      });
      const { count: sessionsBefore } = await client
        .from('activity_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      await review.deferSuggestion(userId, sessionId);
      const deferred = await getSession(sessionId);
      assert.equal(deferred.suggested_endurance_template_id, firstTemplateId, 'defer keeps the suggestion');
      assert.equal(deferred.template_match_score, 79, 'defer keeps the score');
      assert.equal(typeof deferred.template_suggestion_deferred_at, 'string', 'defer stores a timestamp');
      const deferredAt = deferred.template_suggestion_deferred_at;

      const { error: sameSuggestionError } = await client
        .from('activity_sessions')
        .update({ suggested_endurance_template_id: firstTemplateId, template_match_score: 78 })
        .eq('id', sessionId);
      if (sameSuggestionError) throw new Error(`refresh same suggestion failed: ${sameSuggestionError.message}`);
      assert.equal(
        (await getSession(sessionId)).template_suggestion_deferred_at,
        deferredAt,
        'recalculating the same suggestion preserves the defer state',
      );

      const { error: changedSuggestionError } = await client
        .from('activity_sessions')
        .update({ suggested_endurance_template_id: secondTemplateId })
        .eq('id', sessionId);
      if (changedSuggestionError) throw new Error(`change suggestion failed: ${changedSuggestionError.message}`);
      assert.equal(
        (await getSession(sessionId)).template_suggestion_deferred_at,
        null,
        'a different suggestion becomes prominent again',
      );

      await review.deferSuggestion(userId, sessionId);
      await review.associateTemplate(userId, sessionId, { enduranceTemplateId: secondTemplateId });
      const associated = await getSession(sessionId);
      assert.equal(associated.endurance_template_id, secondTemplateId, 'the selected template is associated');
      assert.equal(associated.template_suggestion_deferred_at, null, 'association clears the defer state');
      const { count: sessionsAfter } = await client
        .from('activity_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      assert.equal(sessionsAfter, sessionsBefore, 'defer and association do not create another session');
      pass('endurance deferred suggestion: persistent, reset safely, no duplicate session');
    }

    // --- Endurance SERIES MATCH: exact ordered phases auto-link one existing session ---
    {
      const templateId = randomUUID();
      const groupId = randomUUID();
      const decoyTemplateId = randomUUID();
      const planId = randomUUID();
      createdTemplateIds.add(templateId);
      createdTemplateIds.add(decoyTemplateId);
      createdPlanIds.add(planId);

      const { error: templateError } = await client.from('endurance_workout_templates').insert({
        id: templateId,
        user_id: userId,
        base_name: 'Exact Suunto 4 x 1 km',
        sport_type: 'running',
      });
      if (templateError) throw new Error(`insert endurance template failed: ${templateError.message}`);

      const { error: stepsError } = await client.from('endurance_workout_steps').insert([
        {
          id: randomUUID(),
          template_id: templateId,
          user_id: userId,
          order_index: 0,
          is_group: false,
          repetitions: 1,
          phase_type: 'warmup',
          duration_type: 'time',
          duration_s: 900,
          target_type: 'none',
        },
        {
          id: groupId,
          template_id: templateId,
          user_id: userId,
          order_index: 1,
          is_group: true,
          repetitions: 4,
          phase_type: 'interval',
          duration_type: 'distance',
          target_type: 'none',
        },
        {
          id: randomUUID(),
          template_id: templateId,
          user_id: userId,
          parent_step_id: groupId,
          order_index: 0,
          is_group: false,
          repetitions: 1,
          phase_type: 'interval',
          duration_type: 'distance',
          distance_m: 1000,
          target_type: 'pace',
          target_min: 280,
          target_max: 280,
        },
        {
          id: randomUUID(),
          template_id: templateId,
          user_id: userId,
          parent_step_id: groupId,
          order_index: 1,
          is_group: false,
          repetitions: 1,
          phase_type: 'recovery',
          duration_type: 'time',
          duration_s: 120,
          target_type: 'none',
        },
        {
          id: randomUUID(),
          template_id: templateId,
          user_id: userId,
          order_index: 2,
          is_group: false,
          repetitions: 1,
          phase_type: 'cooldown',
          duration_type: 'time',
          duration_s: 600,
          target_type: 'none',
        },
      ]);
      if (stepsError) throw new Error(`insert endurance steps failed: ${stepsError.message}`);

      const { error: decoyTemplateError } = await client.from('endurance_workout_templates').insert({
        id: decoyTemplateId,
        user_id: userId,
        base_name: 'Unplanned ambiguous 4 x 1 km',
        sport_type: 'running',
      });
      if (decoyTemplateError) throw new Error(`insert decoy template failed: ${decoyTemplateError.message}`);
      const { data: sourceSteps, error: sourceStepsError } = await client
        .from('endurance_workout_steps')
        .select('*')
        .eq('template_id', templateId);
      if (sourceStepsError) throw new Error(`read source endurance steps failed: ${sourceStepsError.message}`);
      const decoyStepIds = new Map((sourceSteps ?? []).map(step => [step.id, randomUUID()]));
      const { error: decoyStepsError } = await client.from('endurance_workout_steps').insert(
        (sourceSteps ?? []).map(step => {
          const { created_at: _createdAt, ...sourceStep } = step;
          void _createdAt;
          return {
            ...sourceStep,
            id: decoyStepIds.get(step.id),
            template_id: decoyTemplateId,
            parent_step_id: step.parent_step_id == null ? null : decoyStepIds.get(step.parent_step_id),
          };
        }),
      );
      if (decoyStepsError) throw new Error(`insert decoy endurance steps failed: ${decoyStepsError.message}`);

      const { error: planError } = await client.from('workout_plans').insert({
        id: planId,
        user_id: userId,
        planned_date: '2026-06-13',
        status: 'planned',
        endurance_template_id: templateId,
      });
      if (planError) throw new Error(`insert workout plan failed: ${planError.message}`);

      const exactLaps = [
        [1477.4, 600],
        [1000, 294.4],
        [190.1, 120],
        [1000, 284.4],
        [163.1, 120],
        [1000, 286.7],
        [173.1, 120],
        [1000, 289.6],
        [171, 120],
        [1525.9, 600],
        [36, 13.6],
      ];
      let offsetSeconds = 0;
      const nativeLaps = exactLaps.map(([distanceM, durationSeconds], index) => {
        const startOffsetSeconds = offsetSeconds;
        offsetSeconds += durationSeconds;
        return {
          lapIndex: index + 1,
          lapType: index === exactLaps.length - 1 ? ('distance' as const) : ('manual' as const),
          distanceM,
          durationSeconds,
          avgPaceSecondsPerKm: (durationSeconds / distanceM) * 1000,
          avgHeartRate: 150,
          maxHeartRate: 170,
          startOffsetSeconds,
          endOffsetSeconds: offsetSeconds,
        };
      });
      const activity: CanonicalActivity = {
        provider: 'suunto',
        sourceFileType: 'fit',
        sportType: 'running',
        sportSubtype: null,
        providerActivityId: `suunto-series-${Date.now()}`,
        summary: {
          startedAt: '2026-06-13T08:00:00Z',
          endedAt: '2026-06-13T08:47:29Z',
          timezone: 'UTC',
          startedAtLocal: '2026-06-13T08:00:00',
          endedAtLocal: '2026-06-13T08:47:29',
          durationSeconds: 2849,
          elapsedSeconds: 2849,
          distanceM: 7739,
          caloriesKcal: 866,
          avgHeartRate: 156,
          maxHeartRate: 170,
          minHeartRate: null,
          avgSpeedMps: 7739 / 2849,
          maxSpeedMps: null,
          avgCadence: 137,
          maxCadence: null,
          avgPowerW: null,
          maxPowerW: null,
          elevationGainM: 16,
          elevationLossM: null,
          avgTemperatureC: null,
          maxTemperatureC: null,
          totalSteps: 3163,
          recoveryTimeSeconds: null,
          vo2Max: 50.7,
          epoc: null,
          pte: null,
          tss: 57,
        },
        streams: {
          position: [],
          heartRate: [],
          speed: [],
          distance: [],
          altitude: [],
          cadence: [],
          power: [],
          temperature: [],
        },
        laps: [
          ...nativeLaps,
          {
            lapIndex: 12,
            lapType: 'distance',
            distanceM: 739,
            durationSeconds: 309.3,
            avgPaceSecondsPerKm: (309.3 / 739) * 1000,
            avgHeartRate: 163,
            maxHeartRate: 170,
            startOffsetSeconds: null,
            endOffsetSeconds: null,
          },
        ],
        heartRateZones: [],
        device: null,
        vendorFields: {},
      };
      const sourceRecordId = `suunto-series-source-${Date.now()}`;
      const writerInput = {
        userId,
        activity,
        provenance: {
          provider: 'suunto' as const,
          sourceChannel: 'cloud' as const,
          sourcePackage: null,
          sourceProviderKey: 'suunto',
          sourceRecordId,
          sourceUpdatedAt: '2026-06-13T09:00:00Z',
          rawPayloadId: null,
        },
        canonicalVersion: 5,
      };
      const { count: sessionsBeforeMatch } = await client
        .from('activity_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      const sessionId = await writer.upsertActivity(writerInput);
      createdSessionIds.add(sessionId);
      const ambiguousSession = await getSession(sessionId);
      assert.equal(
        ambiguousSession.endurance_template_id,
        null,
        'an equally scoring unplanned template blocks auto-link',
      );
      assert.equal(
        ambiguousSession.suggested_endurance_template_id,
        templateId,
        'the planned template wins the tie only as a suggestion',
      );
      await client.from('endurance_workout_steps').delete().eq('template_id', decoyTemplateId);
      await client.from('endurance_workout_templates').delete().eq('id', decoyTemplateId);
      createdTemplateIds.delete(decoyTemplateId);
      const repeatedSessionId = await writer.upsertActivity(writerInput);
      assert.equal(repeatedSessionId, sessionId, 're-sync must update the same imported session');
      const matchedSession = await getSession(sessionId);
      assert.equal(matchedSession.endurance_template_id, templateId, 'series template must auto-associate');
      assert.equal(matchedSession.suggested_endurance_template_id, null, 'strong structural match is not a suggestion');
      assert.equal(matchedSession.template_match_method, 'structural');
      assert.ok((matchedSession.template_match_score ?? 0) >= 80, 'ordered structural score must be strong');

      const { data: matchedPlan, error: matchedPlanError } = await client
        .from('workout_plans')
        .select('*')
        .eq('id', planId)
        .single();
      if (matchedPlanError) throw new Error(`read matched workout plan failed: ${matchedPlanError.message}`);
      assert.equal(matchedPlan.status, 'completed', 'matched plan must be completed');
      assert.equal(matchedPlan.activity_session_id, sessionId, 'matched plan must reference the imported session');

      const { count: persistedLapCount } = await client
        .from('activity_laps')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId);
      assert.equal(persistedLapCount, 11, 'the exact Suunto workout must retain its eleven native laps');
      const { count: sessionsAfterMatch } = await client
        .from('activity_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      assert.equal(
        sessionsAfterMatch,
        (sessionsBeforeMatch ?? 0) + 1,
        'writer and re-sync must create exactly one session',
      );
      pass('endurance series match: 11 laps kept, template linked, plan completed, no duplicate session');
    }

    // --- Strength REVERT (keep mine): previous app values restored ---
    {
      const receivedAt = new Date().toISOString();
      const session = await insertSession({
        sport_type: 'strength',
        start_time: receivedAt,
        duration_s: 3600,
        calories_kcal: 400,
        avg_heart_rate: 120,
        source: 'imported',
        imported_at: receivedAt,
        pending_watch_metrics: {
          previous: { duration_s: 3000, avg_heart_rate: 110 },
          received_at: receivedAt,
        },
      });
      await review.revertWatchMetrics(userId, session);
      const reverted = await getSession(session);
      assert.equal(reverted.duration_s, 3000, 'duration reverted to app value');
      assert.equal(reverted.avg_heart_rate, 110, 'hr reverted to app value');
      assert.equal(reverted.calories_kcal, 400, 'non-conflicting watch value kept');
      assert.equal(reverted.pending_watch_metrics, null, 'pending cleared');
      pass('strength revert: previous app values restored, pending cleared');
    }

    // --- Strength KEEP WATCH (and do-nothing equivalent): watch values stay ---
    {
      const receivedAt = new Date().toISOString();
      const session = await insertSession({
        sport_type: 'strength',
        start_time: receivedAt,
        duration_s: 3600,
        calories_kcal: 400,
        source: 'imported',
        imported_at: receivedAt,
        pending_watch_metrics: { previous: { duration_s: 3000 }, received_at: receivedAt },
      });
      await review.keepWatchMetrics(userId, session);
      const kept = await getSession(session);
      assert.equal(kept.duration_s, 3600, 'watch value remains applied (default wins)');
      assert.equal(kept.pending_watch_metrics, null, 'pending cleared');
      pass('strength keep watch: watch values remain, pending cleared');
    }

    // --- Strength ASSIGN: generic deleted, target keeps its sets + gets metrics ---
    if (exerciseId) {
      const target = await insertSession({ sport_type: 'strength', name: 'Push day', total_sets: 1 });
      await client.from('workout_sets').insert({
        session_id: target,
        user_id: userId,
        exercise_id: exerciseId,
        set_number: 1,
        reps: 10,
        weight_kg: 50,
      });
      const generic = await insertSession({
        sport_type: 'strength',
        duration_s: 3300,
        calories_kcal: 380,
        avg_heart_rate: 118,
        source: 'imported',
        imported_at: new Date().toISOString(),
        needs_strength_review: true,
      });
      const survivorId = await review.assignStrengthSession(userId, generic, target);
      assert.equal(survivorId, target);
      assert.equal(await exists(generic), false, 'generic session deleted after assign');
      const t = await getSession(target);
      assert.equal(t.duration_s, 3300, 'watch metrics applied to target');
      const { count: setCount } = await client
        .from('workout_sets')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', target);
      assert.equal(setCount ?? 0, 1, 'target keeps its sets (structure preserved, not lost/duplicated)');
      pass('strength assign: generic deleted, target keeps sets + gets metrics');
    } else {
      results.push('[skip] strength assign (no exercises seeded locally)');
    }

    // --- Strength KEEP AS NEW: nothing deleted, flag cleared ---
    {
      const generic = await insertSession({
        sport_type: 'strength',
        duration_s: 3300,
        source: 'imported',
        imported_at: new Date().toISOString(),
        needs_strength_review: true,
      });
      const same = await review.assignStrengthSession(userId, generic, undefined);
      assert.equal(same, generic);
      assert.equal(await exists(generic), true, 'keep-as-new keeps the session');
      const g = await getSession(generic);
      assert.equal(g.needs_strength_review, false, 'review flag cleared');
      pass('strength keep-as-new: session kept, flag cleared');
    }

    // --- SAFETY: merge must never delete an app-created (non-imported) session ---
    {
      const manualA = await insertSession({
        sport_type: 'running',
        distance_m: 5000,
        duration_s: 1500,
        name: 'Manual A',
      });
      const manualB = await insertSession({
        sport_type: 'running',
        distance_m: 5000,
        duration_s: 1500,
        name: 'Manual B',
      });
      let threw = false;
      try {
        await review.mergeDuplicate(userId, manualA, manualB);
      } catch {
        threw = true;
      }
      assert.equal(threw, true, 'merge must refuse to delete an app-created session');
      assert.equal(await exists(manualA), true, 'manual A preserved');
      assert.equal(await exists(manualB), true, 'manual B preserved');
      pass('safety: merge refuses to delete an app-created session');
    }

    // --- SAFETY: assign must never delete an app-created (non-imported) session ---
    {
      const target = await insertSession({ sport_type: 'strength', name: 'Target' });
      const manualGeneric = await insertSession({ sport_type: 'strength', duration_s: 3000, name: 'Manual gym' });
      let threw = false;
      try {
        await review.assignStrengthSession(userId, manualGeneric, target);
      } catch {
        threw = true;
      }
      assert.equal(threw, true, 'assign must refuse to delete an app-created session');
      assert.equal(await exists(manualGeneric), true, 'manual gym session preserved');
      assert.equal(await exists(target), true, 'target preserved');
      pass('safety: assign refuses to delete an app-created session');
    }
  } finally {
    for (const id of createdPlanIds) {
      await client.from('workout_plans').delete().eq('id', id);
    }
    for (const id of createdSessionIds) {
      await client.from('workout_sets').delete().eq('session_id', id);
      await client.from('activity_laps').delete().eq('session_id', id);
      await client.from('activity_route_points').delete().eq('session_id', id);
      await client.from('activity_sessions').delete().eq('id', id);
    }
    for (const id of createdTemplateIds) {
      await client.from('endurance_workout_steps').delete().eq('template_id', id);
      await client.from('endurance_workout_templates').delete().eq('id', id);
    }
    await client.auth.admin.deleteUser(userId);
  }

  console.log(results.join('\n'));
  console.log(`\nImport-review integration check: ${results.filter(r => r.startsWith('[PASS]')).length} passed`);
}

main().catch(error => {
  console.error('[FAIL]', error);
  process.exit(1);
});
