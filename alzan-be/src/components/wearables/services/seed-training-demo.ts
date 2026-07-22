/**
 * Seeds realistic demo data for the local seed user (info@alzan.com) to exercise
 * EVERY imported-activity case end to end. It does NOT pre-paint review state:
 * it inserts the real prior state (workouts logged in the app, templates, a
 * planned routine) and then feeds watch activities through the REAL import
 * pipeline (CanonicalActivityWriterService.upsertActivity), exactly like Suunto
 * would — so duplicates, conflicts, matches and suggestions are produced by the
 * production logic. This both seeds the app and proves the flow works.
 *
 * NOT part of the hermetic verify suite (needs a local Supabase + service role).
 * Idempotent: deletes its own demo rows first. Run:
 *
 *   pnpm --prefix alzan-be run seed:training
 *
 * Refuses to run against a non-local database.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { DedupeService } from './dedupe.service';
import { ImportReconciliationService } from './import-reconciliation.service';
import { RawPayloadService } from './raw-payload.service';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import {
  CanonicalActivity,
  CanonicalActivityLap,
  CanonicalActivitySummary,
} from '../../activity-import/parsers/activity-import-canonical.types';
import { CanonicalProvenance } from '../domain/wearable.types';

config({ path: resolve(__dirname, '../../../../.env') });

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const USER_ID = '4424c5d6-5751-4038-aa39-bd85895ddb78'; // info@alzan.com seed user
const EXERCISE_ID = '03f52fed-5dc6-45c4-a38b-7c571f345495'; // a real seeded exercise

const ID = {
  tplRun10k: '5eed0000-0000-4000-8000-000000000001',
  tplRunIntervals: '5eed0000-0000-4000-8000-000000000002',
  tplGymPush: '5eed0000-0000-4000-8000-000000000003',
  tplSeriesExample: '5eed0000-0000-4000-8000-000000000004',
  stepGroup: '5eed0000-0000-4000-8000-000000000010',
  stepWork: '5eed0000-0000-4000-8000-000000000011',
  stepRec: '5eed0000-0000-4000-8000-000000000012',
  stepSeriesWarmup: '5eed0000-0000-4000-8000-000000000020',
  stepSeriesGroup: '5eed0000-0000-4000-8000-000000000021',
  stepSeriesWork: '5eed0000-0000-4000-8000-000000000022',
  stepSeriesRec: '5eed0000-0000-4000-8000-000000000023',
  stepSeriesCooldown: '5eed0000-0000-4000-8000-000000000024',
  tplExercise: '5eed0000-0000-4000-8000-000000000013',
  appRunDup: '5eed0000-0000-4000-8000-000000000101',
  appRideWeak: '5eed0000-0000-4000-8000-000000000102',
  appStrengthFinished: '5eed0000-0000-4000-8000-000000000103',
  appStrengthA: '5eed0000-0000-4000-8000-000000000104',
  appStrengthB: '5eed0000-0000-4000-8000-000000000105',
  uiStrongDuplicateTarget: '5eed0000-0000-4000-8000-000000000106',
  uiStrongDuplicateImport: '5eed0000-0000-4000-8000-000000000107',
  uiTemplateSuggestion: '5eed0000-0000-4000-8000-000000000108',
  uiCleanLatestImport: '5eed0000-0000-4000-8000-000000000109',
} as const;

const APP_SESSION_IDS = [
  ID.appRunDup,
  ID.appRideWeak,
  ID.appStrengthFinished,
  ID.appStrengthA,
  ID.appStrengthB,
  ID.uiStrongDuplicateTarget,
  ID.uiStrongDuplicateImport,
  ID.uiTemplateSuggestion,
  ID.uiCleanLatestImport,
];

/** Local day N days ago at the given hour (ISO). */
function dayAt(daysAgo: number, hour: number, minute = 0): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute).toISOString();
}

const emptyStreams = () => ({
  position: [],
  heartRate: [],
  speed: [],
  distance: [],
  altitude: [],
  cadence: [],
  power: [],
  temperature: [],
});

function summary(partial: Partial<CanonicalActivitySummary>): CanonicalActivitySummary {
  return {
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    elapsedSeconds: null,
    distanceM: null,
    caloriesKcal: null,
    avgHeartRate: null,
    maxHeartRate: null,
    minHeartRate: null,
    avgSpeedMps: null,
    maxSpeedMps: null,
    avgCadence: null,
    maxCadence: null,
    avgPowerW: null,
    maxPowerW: null,
    elevationGainM: null,
    elevationLossM: null,
    avgTemperatureC: null,
    maxTemperatureC: null,
    totalSteps: null,
    recoveryTimeSeconds: null,
    vo2Max: null,
    epoc: null,
    pte: null,
    tss: null,
    ...partial,
  };
}

function watchActivity(input: {
  sportType: CanonicalActivity['sportType'];
  providerActivityId: string;
  summary: Partial<CanonicalActivitySummary>;
  laps?: CanonicalActivityLap[];
}): CanonicalActivity {
  return {
    provider: 'suunto',
    sourceFileType: 'fit',
    sportType: input.sportType,
    sportSubtype: null,
    providerActivityId: input.providerActivityId,
    summary: summary(input.summary),
    streams: emptyStreams(),
    laps: input.laps ?? [],
    heartRateZones: [],
    device: null,
    vendorFields: {},
  };
}

const provenance = (recordId: string): CanonicalProvenance => ({
  provider: 'suunto',
  sourceChannel: 'cloud',
  sourcePackage: null,
  sourceProviderKey: null,
  sourceRecordId: recordId,
  sourceUpdatedAt: new Date().toISOString(),
  rawPayloadId: null,
});

function intervalLaps(
  reps: number,
  repDistanceM: number,
  repDurationS: number,
  recoveryS: number,
): CanonicalActivityLap[] {
  const laps: CanonicalActivityLap[] = [];
  let index = 0;
  for (let rep = 0; rep < reps; rep += 1) {
    laps.push({
      lapIndex: index++,
      lapType: 'distance',
      distanceM: repDistanceM,
      durationSeconds: repDurationS,
      avgPaceSecondsPerKm: (repDurationS / repDistanceM) * 1000,
      avgHeartRate: 170,
      maxHeartRate: 178,
      startOffsetSeconds: null,
      endOffsetSeconds: null,
    });
    if (rep < reps - 1) {
      laps.push({
        lapIndex: index++,
        lapType: 'time',
        distanceM: 200,
        durationSeconds: recoveryS,
        avgPaceSecondsPerKm: (recoveryS / 200) * 1000,
        avgHeartRate: 130,
        maxHeartRate: 150,
        startOffsetSeconds: null,
        endOffsetSeconds: null,
      });
    }
  }
  return laps;
}

async function main(): Promise<void> {
  if (!url || !serviceKey) {
    console.log('[skip] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return;
  }
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    console.log(`[skip] refusing to seed a non-local Supabase (${url})`);
    return;
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } }) as SupabaseClient;
  const adminStub = { client: db } as unknown as SupabaseAdminService;
  const rawPayload = new RawPayloadService(adminStub);
  const reconciliation = new ImportReconciliationService(adminStub);
  const writer = new CanonicalActivityWriterService(adminStub, rawPayload, new DedupeService(), reconciliation);

  const fail = (step: string, error: { message: string } | null) => {
    if (error) throw new Error(`${step}: ${error.message}`);
  };

  // ---- Cleanup previous demo rows (children cascade on session delete) ----
  fail('cleanup app sessions', (await db.from('activity_sessions').delete().in('id', APP_SESSION_IDS)).error);
  fail(
    'cleanup watch sessions',
    (await db.from('activity_sessions').delete().eq('user_id', USER_ID).like('provider_activity_id', 'seed-%')).error,
  );
  fail('cleanup plans by gym', (await db.from('workout_plans').delete().eq('gym_template_id', ID.tplGymPush)).error);
  fail(
    'cleanup steps',
    (await db.from('endurance_workout_steps').delete().in('template_id', [ID.tplRunIntervals, ID.tplSeriesExample]))
      .error,
  );
  fail(
    'cleanup template exercises',
    (await db.from('workout_template_exercises').delete().eq('workout_template_id', ID.tplGymPush)).error,
  );
  fail(
    'cleanup endurance templates',
    (
      await db
        .from('endurance_workout_templates')
        .delete()
        .in('id', [ID.tplRun10k, ID.tplRunIntervals, ID.tplSeriesExample])
    ).error,
  );
  fail('cleanup gym templates', (await db.from('workout_templates').delete().eq('id', ID.tplGymPush)).error);

  // ---- Templates the user planned in the app ----
  fail(
    'endurance templates',
    (
      await db.from('endurance_workout_templates').insert([
        {
          id: ID.tplRun10k,
          user_id: USER_ID,
          sport_type: 'running',
          base_name: '10K steady run',
          description: 'Easy continuous 10 km at marathon pace.',
          total_distance_m: 10000,
          total_duration_s: 3000,
        },
        {
          id: ID.tplRunIntervals,
          user_id: USER_ID,
          sport_type: 'running',
          base_name: '6 x 400m intervals',
          description: '6 reps of 400m with 90s recovery jogs.',
          total_distance_m: 4800,
          total_duration_s: 1800,
        },
        {
          id: ID.tplSeriesExample,
          user_id: USER_ID,
          sport_type: 'running',
          base_name: 'series example',
          description:
            'Plantilla de series: Calentamiento 15min Zona 2 + 6x (400m a 4:00/km + 2min rec) + 10min enfriamiento.',
          total_distance_m: 2400,
          total_duration_s: 2796,
          scheduled_day: 2,
          recurrence_start_date: dayAt(7, 0).slice(0, 10),
          recurrence_end_date: dayAt(-6, 0).slice(0, 10),
        },
      ])
    ).error,
  );
  fail(
    'endurance steps',
    (
      await db.from('endurance_workout_steps').insert([
        {
          id: ID.stepGroup,
          template_id: ID.tplRunIntervals,
          order_index: 0,
          is_group: true,
          repetitions: 6,
          phase_type: 'interval',
          duration_type: 'distance',
          target_type: 'none',
        },
        {
          id: ID.stepWork,
          template_id: ID.tplRunIntervals,
          parent_step_id: ID.stepGroup,
          order_index: 0,
          phase_type: 'interval',
          duration_type: 'distance',
          distance_m: 400,
          target_type: 'pace',
          target_min: 225,
          target_max: 225,
        },
        {
          id: ID.stepRec,
          template_id: ID.tplRunIntervals,
          parent_step_id: ID.stepGroup,
          order_index: 1,
          phase_type: 'recovery',
          duration_type: 'time',
          duration_s: 90,
          target_type: 'none',
        },
        {
          id: ID.stepSeriesWarmup,
          template_id: ID.tplSeriesExample,
          order_index: 0,
          is_group: false,
          repetitions: 1,
          phase_type: 'warmup',
          duration_type: 'time',
          duration_s: 900,
          target_type: 'heart_rate',
          target_min: 2,
          target_max: 2,
        },
        {
          id: ID.stepSeriesGroup,
          template_id: ID.tplSeriesExample,
          order_index: 1,
          is_group: true,
          repetitions: 6,
          phase_type: 'interval',
          duration_type: 'distance',
          target_type: 'none',
        },
        {
          id: ID.stepSeriesWork,
          template_id: ID.tplSeriesExample,
          parent_step_id: ID.stepSeriesGroup,
          order_index: 0,
          is_group: false,
          repetitions: 1,
          phase_type: 'interval',
          duration_type: 'distance',
          distance_m: 400,
          target_type: 'pace',
          target_min: 240,
          target_max: 240,
        },
        {
          id: ID.stepSeriesRec,
          template_id: ID.tplSeriesExample,
          parent_step_id: ID.stepSeriesGroup,
          order_index: 1,
          is_group: false,
          repetitions: 1,
          phase_type: 'recovery',
          duration_type: 'time',
          duration_s: 120,
          target_type: 'none',
        },
        {
          id: ID.stepSeriesCooldown,
          template_id: ID.tplSeriesExample,
          order_index: 2,
          is_group: false,
          repetitions: 1,
          phase_type: 'cooldown',
          duration_type: 'time',
          duration_s: 600,
          target_type: 'none',
        },
      ])
    ).error,
  );
  fail(
    'gym template',
    (
      await db
        .from('workout_templates')
        .insert([
          { id: ID.tplGymPush, user_id: USER_ID, base_name: 'Push day', description: 'Chest, shoulders, triceps.' },
        ])
    ).error,
  );
  fail(
    'gym template exercise',
    (
      await db.from('workout_template_exercises').insert([
        {
          id: ID.tplExercise,
          workout_template_id: ID.tplGymPush,
          exercise_id: EXERCISE_ID,
          order_index: 0,
          target_sets: 4,
          target_reps_min: 8,
          target_reps_max: 12,
        },
      ])
    ).error,
  );
  // A gym routine planned for today (the strength generic import will suggest it).
  fail(
    'planned routine',
    (
      await db.from('workout_plans').insert([
        {
          user_id: USER_ID,
          planned_date: dayAt(0, 0).slice(0, 10),
          status: 'planned',
          gym_template_id: ID.tplGymPush,
        },
      ])
    ).error,
  );

  // ---- Prior state: workouts the user logged IN THE APP (manual/interactive) ----
  const appSession = async (id: string, row: Record<string, unknown>) => {
    fail(
      `app session ${id}`,
      (
        await db
          .from('activity_sessions')
          .insert({ id, user_id: USER_ID, status: 'completed', source: 'manual', provider: 'manual', ...row })
          .select('id')
          .single()
      ).error,
    );
  };
  const uiImportSession = async (id: string, row: Record<string, unknown>) => {
    fail(
      `ui import session ${id}`,
      (
        await db
          .from('activity_sessions')
          .insert({
            id,
            user_id: USER_ID,
            status: 'completed',
            source: 'imported',
            provider: 'suunto',
            imported_at: new Date().toISOString(),
            ...row,
          })
          .select('id')
          .single()
      ).error,
    );
  };
  await appSession(ID.appRunDup, {
    sport_type: 'running',
    name: 'Easy run',
    start_time: dayAt(1, 7),
    distance_m: 10000,
    duration_s: 3000,
    avg_heart_rate: 150,
    calories_kcal: 650,
  });
  await appSession(ID.appRideWeak, {
    sport_type: 'cycling',
    name: 'Lunch ride',
    start_time: dayAt(2, 12),
    distance_m: 20000,
    duration_s: 3600,
    avg_heart_rate: 132,
  });
  await appSession(ID.appStrengthFinished, {
    sport_type: 'strength',
    name: 'Leg day',
    start_time: dayAt(4, 18),
    duration_s: 3120,
    calories_kcal: 410,
    avg_heart_rate: 112,
    total_sets: 2,
    total_reps: 20,
    total_volume_kg: 1000,
  });
  await appSession(ID.appStrengthA, {
    sport_type: 'strength',
    name: 'Push session',
    start_time: dayAt(5, 7),
    duration_s: 2700,
    total_sets: 1,
    total_reps: 10,
    total_volume_kg: 500,
  });
  await appSession(ID.appStrengthB, {
    sport_type: 'strength',
    name: 'Pull session',
    start_time: dayAt(5, 19),
    duration_s: 2800,
    total_sets: 1,
    total_reps: 10,
    total_volume_kg: 520,
  });
  await appSession(ID.uiStrongDuplicateTarget, {
    sport_type: 'running',
    name: 'SEED target · strong duplicate keeps this',
    start_time: dayAt(8, 7),
    distance_m: 8200,
    duration_s: 2460,
    avg_heart_rate: 148,
    calories_kcal: 540,
  });

  const setRow = (sessionId: string, setNumber: number, weight: number) => ({
    session_id: sessionId,
    user_id: USER_ID,
    exercise_id: EXERCISE_ID,
    set_number: setNumber,
    reps: 10,
    weight_kg: weight,
  });
  fail(
    'app sets',
    (
      await db
        .from('workout_sets')
        .insert([
          setRow(ID.appStrengthFinished, 1, 50),
          setRow(ID.appStrengthFinished, 2, 50),
          setRow(ID.appStrengthA, 1, 50),
          setRow(ID.appStrengthB, 1, 52),
        ])
    ).error,
  );

  // ---- Watch activities fed through the REAL import pipeline ----
  const imported: Array<{ label: string; id: string }> = [];
  const importWatch = async (label: string, activity: CanonicalActivity, recordId: string) => {
    const sessionId = await writer.upsertActivity({ userId: USER_ID, activity, provenance: provenance(recordId) });
    imported.push({ label, id: sessionId });
  };

  // Today, no running yet -> matches the 10K template -> auto-associate.
  await importWatch(
    'endurance auto-match (10K template)',
    watchActivity({
      sportType: 'running',
      providerActivityId: 'seed-run-match',
      summary: {
        startedAt: dayAt(0, 8),
        endedAt: dayAt(0, 8, 50),
        durationSeconds: 3010,
        distanceM: 10050,
        caloriesKcal: 690,
        avgHeartRate: 156,
        avgSpeedMps: 10050 / 3010,
      },
    }),
    'seed-run-match',
  );
  // Day -3, intervals -> structural match against the 6x400 template.
  await importWatch(
    'endurance structural match (6x400)',
    watchActivity({
      sportType: 'running',
      providerActivityId: 'seed-run-intervals',
      summary: {
        startedAt: dayAt(3, 9),
        endedAt: dayAt(3, 9, 35),
        durationSeconds: 2100,
        distanceM: 5000,
        caloriesKcal: 470,
        avgHeartRate: 165,
      },
      laps: intervalLaps(6, 400, 90, 90),
    }),
    'seed-run-intervals',
  );
  // Day -1, same day as the app "Easy run" -> strong endurance duplicate.
  await importWatch(
    'endurance strong duplicate',
    watchActivity({
      sportType: 'running',
      providerActivityId: 'seed-run-dup',
      summary: {
        startedAt: dayAt(1, 7, 2),
        endedAt: dayAt(1, 7, 52),
        durationSeconds: 3010,
        distanceM: 10050,
        caloriesKcal: 655,
        avgHeartRate: 152,
        avgSpeedMps: 10050 / 3010,
      },
    }),
    'seed-run-dup',
  );
  // Day -2, same day as the app ride but quite different -> weak duplicate notice.
  await importWatch(
    'endurance weak duplicate',
    watchActivity({
      sportType: 'cycling',
      providerActivityId: 'seed-ride-weak',
      summary: {
        startedAt: dayAt(2, 17),
        endedAt: dayAt(2, 18, 10),
        durationSeconds: 4200,
        distanceM: 28000,
        caloriesKcal: 720,
        avgHeartRate: 140,
        avgSpeedMps: 28000 / 4200,
      },
    }),
    'seed-ride-weak',
  );
  // Today, generic strength watch import -> matches planned routine (Push day) today -> suggests template.
  await importWatch(
    'strength planned-match (suggest Push day)',
    watchActivity({
      sportType: 'strength',
      providerActivityId: 'seed-strength-planned',
      summary: {
        startedAt: dayAt(0, 17),
        endedAt: dayAt(0, 17, 45),
        durationSeconds: 2700,
        caloriesKcal: 320,
        avgHeartRate: 115,
        maxHeartRate: 160,
      },
    }),
    'seed-strength-planned',
  );
  // Day -6, no strength that day -> generic strength, no sets (case 1).
  await importWatch(
    'strength generic (no sets)',
    watchActivity({
      sportType: 'strength',
      providerActivityId: 'seed-strength-generic',
      summary: {
        startedAt: dayAt(6, 10),
        endedAt: dayAt(6, 10, 55),
        durationSeconds: 3300,
        caloriesKcal: 360,
        avgHeartRate: 118,
        maxHeartRate: 165,
      },
    }),
    'seed-strength-generic',
  );
  // Day -4, one finished strength session with sets -> associate; differing metrics -> conflict (case 2).
  await importWatch(
    'strength metric conflict (associate)',
    watchActivity({
      sportType: 'strength',
      providerActivityId: 'seed-strength-conflict',
      summary: {
        startedAt: dayAt(4, 18, 1),
        endedAt: dayAt(4, 18, 50),
        durationSeconds: 2916,
        caloriesKcal: 372,
        avgHeartRate: 140,
        maxHeartRate: 171,
      },
    }),
    'seed-strength-conflict',
  );
  // Day -5, two strength sessions -> needs review chooser (case 4).
  await importWatch(
    'strength multiple-today (needs review)',
    watchActivity({
      sportType: 'strength',
      providerActivityId: 'seed-strength-multi',
      summary: {
        startedAt: dayAt(5, 20),
        endedAt: dayAt(5, 20, 46),
        durationSeconds: 2750,
        caloriesKcal: 300,
        avgHeartRate: 122,
      },
    }),
    'seed-strength-multi',
  );
  // Day -7, two watch strength imports same day, similar but NOT near-identical
  // (~77% similarity) -> "is it a duplicate?" prompt (case 5). A near-identical
  // re-import (>=80%) would instead be auto-deduped silently.
  await importWatch(
    'strength duplicate base',
    watchActivity({
      sportType: 'strength',
      providerActivityId: 'seed-strength-dup-a',
      summary: {
        startedAt: dayAt(7, 19),
        endedAt: dayAt(7, 20),
        durationSeconds: 3600,
        caloriesKcal: 405,
        avgHeartRate: 121,
      },
    }),
    'seed-strength-dup-a',
  );
  await importWatch(
    'strength possible duplicate (prompt)',
    watchActivity({
      sportType: 'strength',
      providerActivityId: 'seed-strength-dup-b',
      summary: {
        startedAt: dayAt(7, 19, 40),
        endedAt: dayAt(7, 20, 25),
        durationSeconds: 3300,
        caloriesKcal: 360,
        avgHeartRate: 118,
      },
    }),
    'seed-strength-dup-b',
  );

  // Stable UI fixtures: these pin review states that can otherwise disappear
  // when reconciliation thresholds evolve or auto-merge protects the user.
  await uiImportSession(ID.uiStrongDuplicateImport, {
    sport_type: 'running',
    name: 'SEED UI · strong duplicate pending',
    start_time: dayAt(8, 7, 1),
    duration_s: 2465,
    distance_m: 8220,
    avg_heart_rate: 150,
    calories_kcal: 545,
    provider_activity_id: 'seed-ui-strong-duplicate',
    duplicate_of_session_id: ID.uiStrongDuplicateTarget,
    duplicate_score: 94,
    duplicate_resolution: 'pending',
  });
  await uiImportSession(ID.uiTemplateSuggestion, {
    sport_type: 'running',
    name: 'SEED UI · template suggestion 70%',
    start_time: dayAt(9, 9),
    duration_s: 2160,
    distance_m: 5600,
    avg_heart_rate: 158,
    calories_kcal: 520,
    provider_activity_id: 'seed-ui-template-suggestion',
    suggested_endurance_template_id: ID.tplRunIntervals,
    template_match_score: 70,
    template_match_method: 'totals',
  });
  await uiImportSession(ID.uiCleanLatestImport, {
    sport_type: 'hiking',
    name: 'SEED UI · clean latest import sheet',
    start_time: dayAt(0, 13),
    duration_s: 3600,
    distance_m: 6200,
    elev_gain_m: 320,
    avg_heart_rate: 118,
    calories_kcal: 430,
    provider_activity_id: 'seed-ui-clean-latest',
    import_review_seen_at: null,
  });

  console.log(
    'Seeded realistic training demo for info@alzan.com (prior app state + watch imports via the real pipeline):',
  );
  console.log('  prior app workouts: 1 run, 1 ride, 3 strength (with sets) across the last week');
  console.log('  watch imports processed by reconciliation:');
  for (const item of imported) console.log(`    - ${item.label} -> session ${item.id}`);
  console.log('  stable UI fixtures:');
  console.log(`    - Home hard conflict: ${ID.uiStrongDuplicateImport}`);
  console.log(`    - Detail template suggestion: ${ID.uiTemplateSuggestion}`);
  console.log(`    - Home clean latest import sheet after conflicts are resolved: ${ID.uiCleanLatestImport}`);
}

main().catch(error => {
  console.error('[FAIL]', error);
  process.exit(1);
});
