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
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { strict as assert } from 'assert';
import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ImportReconciliationService } from './import-reconciliation.service';
import { ImportReviewService } from './import-review.service';
import { RawPayloadService } from './raw-payload.service';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';

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

  const email = `import-review-check+${Date.now()}@example.com`;
  const { data: created, error: userError } = await client.auth.admin.createUser({
    email,
    password: 'Test1234!pass',
    email_confirm: true,
  });
  if (userError || !created.user) throw new Error(`createUser failed: ${userError?.message}`);
  const userId = created.user.id;
  const createdSessionIds = new Set<string>();

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
      pass('endurance merge: existing survives, laps moved, imported deleted');
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

    // --- Strength REVERT (keep mine): previous app values restored ---
    {
      const session = await insertSession({
        sport_type: 'strength',
        duration_s: 3600,
        calories_kcal: 400,
        avg_heart_rate: 120,
        source: 'imported',
        imported_at: new Date().toISOString(),
        pending_watch_metrics: {
          previous: { duration_s: 3000, avg_heart_rate: 110 },
          received_at: new Date().toISOString(),
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
      const session = await insertSession({
        sport_type: 'strength',
        duration_s: 3600,
        calories_kcal: 400,
        source: 'imported',
        imported_at: new Date().toISOString(),
        pending_watch_metrics: { previous: { duration_s: 3000 }, received_at: new Date().toISOString() },
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
  } finally {
    // Cleanup: children cascade on session delete; remove sessions then user.
    for (const id of createdSessionIds) {
      await client.from('workout_sets').delete().eq('session_id', id);
      await client.from('activity_laps').delete().eq('session_id', id);
      await client.from('activity_sessions').delete().eq('id', id);
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
