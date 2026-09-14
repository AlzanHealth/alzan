// Run with SHOPPING_TEST_RUNTIME pointing to a directory containing a temporary
// installation of @electric-sql/pglite. No project dependencies are changed.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const runtime = createRequire(resolve(process.env.SHOPPING_TEST_RUNTIME || '.', 'package.json'));
const { PGlite } = runtime('@electric-sql/pglite');

async function run() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE public.users (id uuid PRIMARY KEY);
      INSERT INTO public.users VALUES ('00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000002');
    `);
    const migration = name => resolve(__dirname, '../migrations', name);
    await db.exec(readFileSync(migration('20260828120000_create_shopping_list_states.sql'), 'utf8'));
    await db.exec(readFileSync(migration('20260909120000_add_shopping_list_availability.sql'), 'utf8'));
    const fix = migration('20260914120000_shopping_list_monotonic_updates.sql');
    if (!process.argv.includes('--without-fix')) await db.exec(readFileSync(fix, 'utf8'));
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'`);
    const write = (completed, quantity, timestamp, user = '00000000-0000-0000-0000-000000000001', key = 'rice') => db.query(`
      INSERT INTO public.shopping_list_states
        (user_id, range_start, range_end, ingredient_key, completed, available_quantity_g, updated_at)
      VALUES ($1, '2026-09-12', '2026-09-18', $2, $3, $4, $5)
      ON CONFLICT (user_id, range_start, range_end, ingredient_key)
      DO UPDATE SET completed = excluded.completed, available_quantity_g = excluded.available_quantity_g,
        updated_at = excluded.updated_at
    `, [user, key, completed, quantity, timestamp]);
    const read = async () => (await db.query(`SELECT completed, available_quantity_g::float AS quantity
      FROM public.shopping_list_states WHERE ingredient_key = 'rice'`)).rows[0];
    await write(false, 0, '2026-09-12T10:00:00Z');
    // A reads, B writes, then A's already prepared upsert arrives.
    assert.deepEqual(await read(), { completed: false, quantity: 0 });
    await write(true, 500, '2026-09-12T10:00:01Z');
    await write(false, 0, '2026-09-12T10:00:00Z');
    assert.deepEqual(await read(), { completed: true, quantity: 500 }, 'stale read/merge/write must not overwrite B');
    await write(false, 0, '2026-09-12T10:00:01Z');
    assert.deepEqual(await read(), { completed: true, quantity: 500 }, 'equal timestamps converge');
    await write(false, 0, '2026-09-12T10:00:02Z');
    assert.deepEqual(await read(), { completed: false, quantity: 0 }, 'a newer uncheck/zero must still work');
    await write(true, null, '2026-09-12T10:00:00Z', undefined, 'bread');
    assert.equal((await db.query('SELECT * FROM public.shopping_list_states')).rows.length, 2);
    await assert.rejects(write(true, 900, '2026-09-12T10:00:03Z', '00000000-0000-0000-0000-000000000002'), /row-level security/);
    await db.exec(`SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'`);
    assert.equal((await db.query('SELECT * FROM public.shopping_list_states')).rows.length, 0);
    console.log('Shopping SQL: stale interleaving, ties, newer zero, local-only insert and RLS passed');
  } finally {
    await db.close();
  }
}
void run();
