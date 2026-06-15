#!/usr/bin/env node
// scripts/guard-cloud.js
// Safety gate for the cloud start commands (start:*:cloud).
//
// Three checks must pass before pointing the app at the cloud Supabase project:
//   1. The branch must not add any migration that is not yet in the cloud
//      baseline (`origin/main`, falling back to `main`). Cloud is deployed from
//      main via the Deploy Database Migrations workflow, so a branch carrying
//      extra migrations would expect a schema the cloud doesn't have yet. A
//      branch with NO pending migrations is safe regardless of its name.
//   2. .env.cloud must exist and have every value filled in (no placeholders).
//   3. No alzan-fe/.env.local-style file may shadow the generated env.
//
// Usage: node scripts/guard-cloud.js  (run automatically by prestart:cloud)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const cloudEnvPath = path.join(ROOT, ".env.cloud");
const migrationsDir = path.join(ROOT, "supabase", "migrations");

function fail(message) {
  console.error(`\n❌  ${message}\n`);
  process.exit(1);
}

function git(args) {
  return execSync(`git ${args}`, { cwd: ROOT }).toString().trim();
}

// ─── 1) No migrations pending vs the cloud baseline ───────────────────────────
let branch;
try {
  branch = git("rev-parse --abbrev-ref HEAD");
} catch {
  fail("No se pudo determinar la rama de git (¿estás dentro del repo?).");
}

// Cloud is deployed from main, so the baseline is origin/main when available
// (closest to what's actually deployed), else local main.
let baselineRef = null;
for (const ref of ["origin/main", "main"]) {
  try {
    execSync(`git rev-parse --verify --quiet ${ref}`, { cwd: ROOT, stdio: "ignore" });
    baselineRef = ref;
    break;
  } catch {
    /* ref not found — try the next one */
  }
}
if (!baselineRef) {
  fail(
    `No encuentro la rama base ("origin/main" ni "main") para comparar migraciones.\n` +
      `   Ejecuta "git fetch origin main" y reintenta.`,
  );
}

const diskMigrations = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))
  : [];

let baselineMigrations;
try {
  baselineMigrations = git(`ls-tree -r --name-only ${baselineRef} -- supabase/migrations/`)
    .split("\n")
    .map((line) => path.basename(line.trim()))
    .filter((name) => name.endsWith(".sql"));
} catch {
  fail(`No se pudieron listar las migraciones de "${baselineRef}".`);
}

const baselineSet = new Set(baselineMigrations);
const pendingMigrations = diskMigrations.filter((f) => !baselineSet.has(f)).sort();

if (pendingMigrations.length) {
  fail(
    `Esta rama ("${branch}") tiene migraciones que aún NO están en "${baselineRef}" (de donde se despliega cloud):\n` +
      pendingMigrations.map((f) => `     - ${f}`).join("\n") +
      `\n   El esquema de la nube todavía no las tiene, así que apuntar la app a cloud la rompería.\n` +
      `   Mergea la rama y lanza el workflow "Deploy Database Migrations", o arranca cloud desde una rama sin migraciones pendientes.`,
  );
}

// ─── 2) .env.cloud must exist and be fully filled ─────────────────────────────
if (!fs.existsSync(cloudEnvPath)) {
  fail(
    `Falta .env.cloud en la raíz.\n` +
      `   Copia .env.cloud.example a .env.cloud y pega las credenciales de la Supabase de la nube.`,
  );
}

const raw = fs.readFileSync(cloudEnvPath, "utf8");
// Flag any KEY= line whose value is empty or still a __PLACEHOLDER__.
const unfilled = [...raw.matchAll(/^\s*([A-Z0-9_]+)\s*=\s*(__.*__|)\s*$/gm)].map(
  (match) => match[1],
);

if (unfilled.length) {
  fail(
    `.env.cloud tiene valores sin rellenar: ${unfilled.join(", ")}.\n` +
      `   Pega las credenciales reales de la Supabase de la nube antes de arrancar.`,
  );
}

// ─── 3) Nada puede tapar el alzan-fe/.env generado ────────────────────────────
// Expo carga .env.local / .env.<NODE_ENV>[.local] con MÁS prioridad que .env, así
// que un override ahí mandaría la app a la Supabase equivocada (p.ej. la local)
// ignorando lo que env:sync:cloud escribe. Lo bloqueamos.
const feDir = path.join(ROOT, "alzan-fe");
const shadows = fs
  .readdirSync(feDir)
  .filter((f) => f.startsWith(".env.") && f !== ".env" && !f.includes("example"))
  .filter((f) => {
    try {
      return /^\s*EXPO_PUBLIC_SUPABASE_URL\s*=/m.test(
        fs.readFileSync(path.join(feDir, f), "utf8"),
      );
    } catch {
      return false;
    }
  });

if (shadows.length) {
  fail(
    `Hay ficheros .env en alzan-fe que TAPAN al generado y mandan la app a la Supabase equivocada:\n` +
      shadows.map((f) => `     - alzan-fe/${f}`).join("\n") +
      `\n   Expo prioriza .env.local / .env.<env> sobre .env. env:sync gestiona alzan-fe/.env,\n` +
      `   así que estos sobran — bórralos:\n` +
      shadows.map((f) => `     rm alzan-fe/${f}`).join("\n"),
  );
}

console.log(
  `✅  Sin migraciones pendientes vs "${baselineRef}" (rama "${branch}"), .env.cloud y alzan-fe/.env verificados — arrancando contra Supabase cloud.`,
);
