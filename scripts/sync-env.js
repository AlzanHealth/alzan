#!/usr/bin/env node
// scripts/sync-env.js
// Reads the root .env and generates package-specific .env files
// with the correct variable names for each package.
//
// Usage: node scripts/sync-env.js
//        pnpm env:sync

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const rootEnvPath = path.join(ROOT, ".env");
const cloudEnvPath = path.join(ROOT, ".env.cloud");

// `--cloud` layers .env.cloud (cloud Supabase credentials) on top of the root
// .env. Only the keys present in .env.cloud are overridden; everything else
// (ports, backend URLs, OAuth, ...) keeps the local values from .env.
const useCloud = process.argv.includes("--cloud");

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const quote = trimmed[0];
  if ((quote !== `"` && quote !== `'`) || trimmed[trimmed.length - 1] !== quote) {
    return trimmed;
  }

  const inner = trimmed.slice(1, -1);
  if (quote === `'`) return inner;

  return inner
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, `"`)
    .replace(/\\\\/g, "\\");
}

function stripInlineComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    const previous = value[index - 1];

    if ((char === `"` || char === `'`) && previous !== "\\") {
      quote = quote === char ? null : quote ?? char;
      continue;
    }

    if (char === "#" && quote === null && (index === 0 || /\s/.test(previous))) {
      return value.slice(0, index);
    }
  }

  return value;
}

function parseEnvFile(filePath) {
  const parsed = {};
  const raw = fs.readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    parsed[match[1]] = unquoteEnvValue(stripInlineComment(match[2]));
  }

  return parsed;
}

function expandEnvValues(values) {
  const expanded = {};
  const resolving = new Set();
  const pattern = /\${([A-Za-z_][A-Za-z0-9_]*)}/g;

  const resolveValue = (key) => {
    if (expanded[key] !== undefined) return expanded[key];
    if (resolving.has(key)) return values[key] ?? "";

    resolving.add(key);
    const rawValue = values[key] ?? "";
    expanded[key] = rawValue.replace(pattern, (_match, refKey) => resolveValue(refKey));
    resolving.delete(key);
    return expanded[key];
  };

  for (const key of Object.keys(values)) {
    resolveValue(key);
  }

  return expanded;
}

if (!fs.existsSync(rootEnvPath)) {
  console.error(
    `❌  Root .env not found. Copy .env.example to .env and fill in your values.`,
  );
  process.exit(1);
}

let merged = parseEnvFile(rootEnvPath);

if (useCloud) {
  if (!fs.existsSync(cloudEnvPath)) {
    console.error(
      `❌  .env.cloud not found. Copy .env.cloud.example to .env.cloud and ` +
        `fill in the cloud Supabase credentials.`,
    );
    process.exit(1);
  }
  merged = { ...merged, ...parseEnvFile(cloudEnvPath) };
  console.log(`☁️   Cloud mode: overlaying .env.cloud on top of .env`);
}

// Expand ${VAR} interpolations using only the merged file values (deterministic,
// independent of the shell environment).
const root = expandEnvValues(merged);

// ─── Mapping definitions ──────────────────────────────────────────────────────
// Format: { TARGET_KEY: "SOURCE_KEY_FROM_ROOT_ENV" }
// URL values (BACKEND_URL, FRONTEND_URL) are already expanded by dotenv-expand
// using ${BE_PORT} / ${FE_PORT} interpolation in the root .env.

const BE_MAPPING = {
  // Server
  PORT: "BE_PORT",
  NODE_ENV: "NODE_ENV",
  BASE_URL: "BACKEND_URL",
  FRONTEND_BASE_URL: "FRONTEND_URL",
  CORS_ORIGIN: "FRONTEND_URL",
  // Supabase
  SUPABASE_URL: "SUPABASE_URL",
  SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY",
  SUPABASE_ANON_KEY: "SUPABASE_ANON_KEY",
  // OAuth Providers
  STRAVA_CLIENT_ID: "STRAVA_CLIENT_ID",
  STRAVA_CLIENT_SECRET: "STRAVA_CLIENT_SECRET",
  STRAVA_DEFAULT_SCOPE: "STRAVA_DEFAULT_SCOPE",
  STRAVA_REDIRECT_URI: "STRAVA_REDIRECT_URI",
  GARMIN_CLIENT_ID: "GARMIN_CLIENT_ID",
  GARMIN_CLIENT_SECRET: "GARMIN_CLIENT_SECRET",
  GARMIN_REDIRECT_URI: "GARMIN_REDIRECT_URI",
  GARMIN_DEFAULT_SCOPE: "GARMIN_DEFAULT_SCOPE",
  POLAR_CLIENT_ID: "POLAR_CLIENT_ID",
  POLAR_CLIENT_SECRET: "POLAR_CLIENT_SECRET",
  POLAR_REDIRECT_URI: "POLAR_REDIRECT_URI",
  POLAR_DEFAULT_SCOPE: "POLAR_DEFAULT_SCOPE",
  SUUNTO_CLIENT_ID: "SUUNTO_CLIENT_ID",
  SUUNTO_CLIENT_SECRET: "SUUNTO_CLIENT_SECRET",
  SUUNTO_REDIRECT_URI: "SUUNTO_REDIRECT_URI",
  SUUNTO_DEFAULT_SCOPE: "SUUNTO_DEFAULT_SCOPE",
  SUUNTO_SUBSCRIPTION_KEY: "SUUNTO_SUBSCRIPTION_KEY",
  SUUNTO_247_ENABLED: "SUUNTO_247_ENABLED",
  SUUNTO_247_SUBSCRIPTION_KEY: "SUUNTO_247_SUBSCRIPTION_KEY",
  COROS_API_BASE_URL: "COROS_API_BASE_URL",
  COROS_CLIENT_ID: "COROS_CLIENT_ID",
  COROS_CLIENT_SECRET: "COROS_CLIENT_SECRET",
  COROS_REDIRECT_URI: "COROS_REDIRECT_URI",
  COROS_ROLLOUT_MODE: "COROS_ROLLOUT_MODE",
  COROS_PILOT_USER_IDS: "COROS_PILOT_USER_IDS",
  COROS_TOKEN_ENCRYPTION_KEY_V1: "COROS_TOKEN_ENCRYPTION_KEY_V1",
  COROS_FIT_ALLOWED_HOSTS: "COROS_FIT_ALLOWED_HOSTS",
  COROS_WEBHOOK_CLIENT: "COROS_WEBHOOK_CLIENT",
  COROS_WEBHOOK_SECRET: "COROS_WEBHOOK_SECRET",
  WHOOP_CLIENT_ID: "WHOOP_CLIENT_ID",
  WHOOP_CLIENT_SECRET: "WHOOP_CLIENT_SECRET",
  WHOOP_REDIRECT_URI: "WHOOP_REDIRECT_URI",
  WHOOP_DEFAULT_SCOPE: "WHOOP_DEFAULT_SCOPE",
  OURA_CLIENT_ID: "OURA_CLIENT_ID",
  OURA_CLIENT_SECRET: "OURA_CLIENT_SECRET",
  OURA_REDIRECT_URI: "OURA_REDIRECT_URI",
  OURA_DEFAULT_SCOPE: "OURA_DEFAULT_SCOPE",
  FITBIT_CLIENT_ID: "FITBIT_CLIENT_ID",
  FITBIT_CLIENT_SECRET: "FITBIT_CLIENT_SECRET",
  FITBIT_REDIRECT_URI: "FITBIT_REDIRECT_URI",
  FITBIT_DEFAULT_SCOPE: "FITBIT_DEFAULT_SCOPE",
  ULTRAHUMAN_CLIENT_ID: "ULTRAHUMAN_CLIENT_ID",
  ULTRAHUMAN_CLIENT_SECRET: "ULTRAHUMAN_CLIENT_SECRET",
  ULTRAHUMAN_REDIRECT_URI: "ULTRAHUMAN_REDIRECT_URI",
  ULTRAHUMAN_DEFAULT_SCOPE: "ULTRAHUMAN_DEFAULT_SCOPE",
  NUTRITION_API_BASE_URL: "NUTRITION_API_BASE_URL",
  WEBSITE_URL: "WEBSITE_URL",
};

const FE_MAPPING = {
  // Port (used by dotenv-cli to pass --port to expo)
  FE_PORT: "FE_PORT",
  // Supabase
  EXPO_PUBLIC_SUPABASE_URL: "SUPABASE_URL",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "SUPABASE_ANON_KEY",
  // APIs
  EXPO_PUBLIC_NUTRITION_API_BASE_URL: "NUTRITION_API_BASE_URL",
  EXPO_PUBLIC_WEBSITE_URL: "WEBSITE_URL",
  EXPO_PUBLIC_ALZAN_BACKEND_BASE_URL: "BACKEND_URL",
};

// ─── Writer ───────────────────────────────────────────────────────────────────
function readExistingEnv(targetPath) {
  if (!fs.existsSync(targetPath)) return {};
  return parseEnvFile(targetPath);
}

function writeEnv(targetPath, root, mapping, label) {
  const lines = [
    `# Auto-generated by scripts/sync-env.js — DO NOT EDIT MANUALLY`,
    `# Edit the root .env and run: pnpm env:sync`,
    ``,
  ];

  // Safety net: never silently wipe a value that only exists in the
  // generated file. The root .env stays the source of truth, but when it has
  // no value for a key the previously generated value is preserved and the
  // user is told to move it to the root .env.
  const existing = readExistingEnv(targetPath);

  for (const [targetKey, source] of Object.entries(mapping)) {
    let value = root?.[source] ?? "";
    if (!value && existing[targetKey]) {
      value = existing[targetKey];
      console.warn(
        `  ⚠️   ${label}: "${source}" is empty in root .env — preserved the existing ` +
          `${targetKey} value. Move it to the root .env to silence this warning.`,
      );
    } else if (!value) {
      console.warn(
        `  ⚠️   ${label}: source key "${source}" not found in root .env`,
      );
    }
    lines.push(`${targetKey}=${value}`);
  }

  fs.writeFileSync(targetPath, lines.join("\n") + "\n", "utf8");
  console.log(`  ✅  Written: ${path.relative(ROOT, targetPath)}`);
}

// Same effect as `expo start --clear`: drop Metro's transform/file-map caches so
// the next start re-inlines the current EXPO_PUBLIC_* values instead of serving
// a bundle built for the previous Supabase target.
function clearMetroCache() {
  const tmp = os.tmpdir();
  let cleared = 0;
  try {
    for (const entry of fs.readdirSync(tmp)) {
      if (entry === "metro-cache" || entry.startsWith("metro-file-map-")) {
        fs.rmSync(path.join(tmp, entry), { recursive: true, force: true });
        cleared++;
      }
    }
  } catch {
    /* best-effort: a missing/locked cache is fine */
  }
  console.log(
    cleared
      ? `  🧹  Caché de Metro limpiada (${cleared} entrada/s) para re-inlinar el nuevo target.`
      : `  🧹  No había caché de Metro que limpiar.`,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const feEnvPath = path.join(ROOT, "alzan-fe", ".env");
// Capture the previous FE Supabase target before overwriting, to detect flips.
const prevFeUrl = readExistingEnv(feEnvPath).EXPO_PUBLIC_SUPABASE_URL;

console.log(`\n🔄  Syncing env from root .env...\n`);

writeEnv(path.join(ROOT, "alzan-be", ".env"), root, BE_MAPPING, "alzan-be");
writeEnv(feEnvPath, root, FE_MAPPING, "alzan-fe");

// EXPO_PUBLIC_* values are inlined into the Metro bundle at build time. When the
// FE Supabase target changes (local ↔ cloud), Metro would otherwise serve a
// bundle built for the previous project. Clearing the cache on a real change
// (and only then) keeps normal restarts fast while guaranteeing local stays
// local and cloud stays cloud.
const newFeUrl = root?.SUPABASE_URL ?? "";
if (prevFeUrl && newFeUrl && prevFeUrl !== newFeUrl) {
  console.log(
    `\n🔁  El target de Supabase del FE cambió:\n` +
      `       antes: ${prevFeUrl}\n` +
      `       ahora: ${newFeUrl}`,
  );
  clearMetroCache();
}

console.log(`\n✨  Done!\n`);
