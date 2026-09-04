#!/usr/bin/env node

const dns = require("dns").promises;
const fs = require("fs");
const path = require("path");

const DEFAULT_BASE_URL = "https://api.alzanhealth.com";
const REQUEST_TIMEOUT_MS = 15_000;

function parseArguments(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    envFile: null,
    requireConfig: false,
  };

  for (const argument of argv) {
    if (argument.startsWith("--base-url=")) {
      options.baseUrl = argument.slice("--base-url=".length);
    } else if (argument.startsWith("--env-file=")) {
      options.envFile = argument.slice("--env-file=".length);
    } else if (argument === "--require-config") {
      options.requireConfig = true;
    } else {
      throw new Error(`Argumento desconocido: ${argument}`);
    }
  }

  return options;
}

function parseEnvFile(filePath) {
  const values = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[2].startsWith("#")) continue;
    let value = match[2];
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function createReporter() {
  const failures = [];
  const pending = [];

  return {
    pass(label, detail) {
      console.log(`PASS     ${label}${detail ? ` — ${detail}` : ""}`);
    },
    fail(label, detail) {
      failures.push(label);
      console.error(`FAIL     ${label}${detail ? ` — ${detail}` : ""}`);
    },
    pending(label, detail) {
      pending.push(label);
      console.log(`PENDING  ${label}${detail ? ` — ${detail}` : ""}`);
    },
    finish(requireConfig) {
      console.log(`\nResultado: ${failures.length} fallo(s), ${pending.length} pendiente(s).`);
      if (failures.length > 0 || (requireConfig && pending.length > 0)) process.exitCode = 1;
    },
  };
}

async function request(url, options = {}) {
  return fetch(url, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function validateConfiguration(values, baseUrl, reporter, requireConfig) {
  const legacyRequired = [
    "COROS_API_BASE_URL",
    "COROS_CLIENT_ID",
    "COROS_CLIENT_SECRET",
    "COROS_REDIRECT_URI",
    "COROS_ROLLOUT_MODE",
    "COROS_PILOT_USER_IDS",
    "COROS_TOKEN_ENCRYPTION_KEY_V1",
    "COROS_FIT_ALLOWED_HOSTS",
    "COROS_WEBHOOK_CLIENT",
    "COROS_WEBHOOK_SECRET",
  ];
  const legacyMissing = legacyRequired.filter((key) => !values[key]?.trim());
  if (legacyMissing.length > 0) {
    const missing = [...legacyMissing];
    const detail = `faltan ${missing.join(", ")}`;
    if (requireConfig) reporter.fail("Configuración COROS", detail);
    else reporter.pending("Configuración COROS", detail);
  }

  if (legacyMissing.length > 0) return;

  const expectedRedirect = `${baseUrl}/oauth/coros/callback`;
  if (values.COROS_REDIRECT_URI !== expectedRedirect) {
    reporter.fail("Redirect URI COROS", `debe ser ${expectedRedirect}`);
  } else {
    reporter.pass("Redirect URI COROS", expectedRedirect);
  }

  if (!new Set(["disabled", "pilot", "public"]).has(values.COROS_ROLLOUT_MODE)) {
    reporter.fail("Rollout COROS", "debe ser disabled, pilot o public");
  } else if (values.COROS_ROLLOUT_MODE !== "pilot") {
    reporter.fail("Rollout COROS", "para sandbox debe ser pilot");
  } else {
    reporter.pass("Rollout COROS", "pilot");
  }

  const pilotIds = values.COROS_PILOT_USER_IDS.split(",").map((value) => value.trim());
  const invalidPilotIds = pilotIds.filter(
    (value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
  if (invalidPilotIds.length > 0) {
    reporter.fail("Usuarios piloto COROS", "COROS_PILOT_USER_IDS debe contener UUID de Supabase");
  } else {
    reporter.pass("Usuarios piloto COROS", `${pilotIds.length} UUID configurado(s)`);
  }

  let encryptionKey;
  try {
    encryptionKey = Buffer.from(values.COROS_TOKEN_ENCRYPTION_KEY_V1, "base64");
  } catch {
    encryptionKey = Buffer.alloc(0);
  }
  if (encryptionKey.length !== 32) {
    reporter.fail("Clave de cifrado COROS", "debe decodificar exactamente 32 bytes base64");
  } else {
    reporter.pass("Clave de cifrado COROS", "32 bytes");
  }

  const allowedApiBases = new Set(["https://opentest.coros.com", "https://open.coros.com"]);
  if (!allowedApiBases.has(values.COROS_API_BASE_URL.replace(/\/$/, ""))) {
    reporter.fail("Host API COROS", "solo opentest.coros.com u open.coros.com");
  } else {
    reporter.pass("Host API COROS", "host permitido");
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const reporter = createReporter();
  const baseUrl = new URL(options.baseUrl);
  baseUrl.pathname = "";
  baseUrl.search = "";
  baseUrl.hash = "";
  const normalizedBaseUrl = baseUrl.toString().replace(/\/$/, "");

  const isLocalBaseUrl = ["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname);
  if (baseUrl.protocol !== "https:" && !(isLocalBaseUrl && baseUrl.protocol === "http:")) {
    reporter.fail("URL pública", "debe usar HTTPS fuera de localhost");
  } else {
    reporter.pass("URL pública", isLocalBaseUrl ? `${normalizedBaseUrl} (local)` : normalizedBaseUrl);
  }

  try {
    const addresses = await dns.lookup(baseUrl.hostname, { all: true });
    if (addresses.length === 0) throw new Error("sin direcciones");
    reporter.pass("DNS", `${baseUrl.hostname} tiene ${addresses.length} dirección(es)`);
  } catch (error) {
    reporter.fail("DNS", error instanceof Error ? error.message : String(error));
  }

  try {
    const response = await request(`${normalizedBaseUrl}/webhooks/coros/status`);
    const body = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    if (response.status === 200 && parsed?.status === "ok") {
      reporter.pass("Status COROS", "HTTP 200 y {\"status\":\"ok\"}");
    } else {
      reporter.fail("Status COROS", `HTTP ${response.status}; respuesta inesperada`);
    }
  } catch (error) {
    reporter.fail("Status COROS", error instanceof Error ? error.message : String(error));
  }

  try {
    const response = await request(`${normalizedBaseUrl}/oauth/coros/callback`);
    const location = response.headers.get("location") || "";
    if (response.status === 303 && location.startsWith("/oauth/error?")) {
      reporter.pass("Callback OAuth COROS", "ruta desplegada y rechaza parámetros ausentes");
    } else {
      reporter.fail("Callback OAuth COROS", `HTTP ${response.status}; Location=${location || "ausente"}`);
    }
  } catch (error) {
    reporter.fail("Callback OAuth COROS", error instanceof Error ? error.message : String(error));
  }

  try {
    const response = await request(`${normalizedBaseUrl}/webhooks/coros/workouts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sportDataList: [] }),
    });
    if (response.status === 401) {
      reporter.pass("Autenticación webhook COROS", "rechaza una petición sin headers");
    } else {
      reporter.fail("Autenticación webhook COROS", `esperaba HTTP 401 y devolvió ${response.status}`);
    }
  } catch (error) {
    reporter.fail("Autenticación webhook COROS", error instanceof Error ? error.message : String(error));
  }

  let values = { ...process.env };
  if (options.envFile) {
    const envPath = path.resolve(options.envFile);
    if (!fs.existsSync(envPath)) {
      reporter.fail("Fichero de configuración", `${envPath} no existe`);
    } else {
      values = { ...values, ...parseEnvFile(envPath) };
      reporter.pass("Fichero de configuración", envPath);
    }
  }
  validateConfiguration(values, normalizedBaseUrl, reporter, options.requireConfig);
  reporter.finish(options.requireConfig);
}

main().catch((error) => {
  console.error(`FAIL     Verificación COROS — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
