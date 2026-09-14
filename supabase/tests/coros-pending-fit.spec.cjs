// Run with SHOPPING_TEST_RUNTIME pointing to a runtime containing @electric-sql/pglite.
// Uses the real lifecycle table DDL and claim migrations in an isolated PostgreSQL engine.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const runtime = createRequire(resolve(process.env.SHOPPING_TEST_RUNTIME || '.', 'package.json'));
const { PGlite } = runtime('@electric-sql/pglite');

async function run() {
  const db = new PGlite();
  const migration = name => readFileSync(resolve(__dirname, '../migrations', name), 'utf8');
  const regression = readFileSync(resolve(__dirname, 'coros_pending_fit_retry.integration.sql'), 'utf8');
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TYPE public.wearable_provider_enum AS ENUM ('coros', 'suunto', 'garmin');
      CREATE TABLE public.users (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now());
      INSERT INTO public.users (id) VALUES ('00000000-0000-0000-0000-000000000001');
      CREATE TABLE public.activity_sessions (
        id uuid PRIMARY KEY, user_id uuid REFERENCES public.users(id), sport_type text,
        provider public.wearable_provider_enum, provider_activity_id text, source_channel text,
        source_package text, source_record_id text, imported_at timestamptz, pending_watch_metrics jsonb
      );
    `);
    const lifecycle = migration('20260713140000_wearable_sync_lifecycle.sql');
    const endOfTables = lifecycle.indexOf('CREATE OR REPLACE FUNCTION public.claim_wearable_sync_job');
    assert.ok(endOfTables > 0);
    await db.exec(lifecycle.slice(0, endOfTables));
    await db.exec(migration('20260904140000_retry_pending_coros_fit.sql'));
    await assert.rejects(db.exec(regression), /COROS_PENDING_FIT_NOT_REPAIRED/, 'old claim must reproduce the bug');
    await db.exec('ROLLBACK');
    await db.exec(migration('20260914120100_coros_pending_fit_identity_compat.sql'));
    await db.exec(regression);
    const signature = 'public.claim_wearable_activity_import(uuid,public.wearable_provider_enum,text,text,text,integer,uuid)';
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const result = await db.query('SELECT has_function_privilege($1, $2, $3) AS allowed', [role, signature, 'EXECUTE']);
      assert.equal(result.rows[0].allowed, role === 'service_role');
    }
    console.log('COROS SQL: old claim fails; fixed claim repairs both identities, skips complete data, reuses IDs and retains permissions');
  } finally {
    await db.close();
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
