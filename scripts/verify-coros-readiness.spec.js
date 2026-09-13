const assert = require("node:assert/strict");
const { validateConfiguration } = require("./verify-coros-readiness");
const failures = [];
const reporter = {
  pass() {},
  pending() {},
  fail(label) {
    failures.push(label);
  },
};
const config = {
  COROS_API_BASE_URL: "https://open.coros.com",
  COROS_CLIENT_ID: "test-client",
  COROS_CLIENT_SECRET: "test-secret",
  COROS_REDIRECT_URI: "https://api.alzanhealth.com/oauth/coros/callback",
  COROS_ROLLOUT_MODE: "public",
  COROS_TOKEN_ENCRYPTION_KEY_V1: Buffer.alloc(32, 1).toString("base64"),
  COROS_FIT_ALLOWED_HOSTS: "oss.coros.com",
};
validateConfiguration(config, "https://api.alzanhealth.com", reporter, true);
assert.deepEqual(
  failures,
  [],
  "OAuth must work without pilot IDs or optional webhook credentials",
);
validateConfiguration(
  { ...config, COROS_ROLLOUT_MODE: "disabled" },
  "https://api.alzanhealth.com",
  reporter,
  true,
);
assert.ok(failures.includes("Rollout COROS"));
console.log("COROS readiness configuration checks passed");
