# Activity Import Verification

Use this guide when you need to check that wearable import modelers still normalize files correctly without owning every watch or account.

## Purpose

The command verifies the backend activity-import integration for the supported providers:

```text
Suunto, Garmin, Strava, Polar, Fitbit, Oura, Ultrahuman, WHOOP, Apple Health/Fitness, Health Connect and COROS
```

It runs the committed parser and service specs one provider at a time, so failures clearly show the provider, the check, and the spec file that failed.

## Command

Run this from the repository root:

```bash
pnpm verify:activity-import
```

The root script delegates to:

```bash
pnpm --prefix alzan-be run verify:activity-import
```

The backend script runs:

```bash
ts-node -r tsconfig-paths/register src/components/activity-import/activity-import.verify.ts
```

You can also narrow the run while developing a provider:

```bash
pnpm verify:activity-import -- --provider suunto
pnpm verify:activity-import -- --provider garmin
pnpm verify:activity-import -- --provider strava
pnpm verify:activity-import -- --kind health
pnpm verify:activity-import -- --kind activity
pnpm verify:activity-import -- --fixture suunto-running-json-user-redacted
```

Supported filters:

- `--provider <provider>` runs the provider spec plus the activity and health fixture manifests filtered to that provider.
- `--fixture <fixture-id>` runs fixture manifests filtered to a single fixture id.
- `--kind activity|health` limits verification to activity or health fixture/spec groups where applicable.

## What It Checks

The runner executes these groups:

- `fixtures`: reads `manifest.json` and validates committed fixtures against expected canonical summaries.
- `health_fixtures`: reads `health-manifest.json` and validates API-shaped health fixtures against the provider health mappers.
- `core`: validates shared route, strength and native-lap parser behavior.
- `service`: validates persistence payloads, route tabs and imported strength data behavior.
- one provider spec per wearable integration: Apple Health, COROS, Fitbit, Garmin, Health Connect, Oura, Polar, Strava, Suunto, Ultrahuman and WHOOP.

Each spec is launched in a separate Node process. That keeps the output useful: one broken provider does not hide which case failed.

## Output

Passing checks look like this:

```text
[RUN] suunto (activity) - Suunto FIT/JSON activity, health, strength and native laps
[PASS] suunto activity (suunto-canonical.mapper.spec.ts) 1.2s
```

Failing checks include:

```text
[FAIL] provider=suunto
kind=activity
check=Suunto FIT/JSON activity, health, strength and native laps
spec=src/components/activity-import/parsers/suunto-canonical.mapper.spec.ts
exitCode=1
duration=1.4s
```

The runner then prints captured `stdout` and `stderr`, followed by a final summary and a compact table with provider, kind, fixture, sport/domain, spec and the first actionable failure message.

## Adding a New Fixture

1. Put the redacted fixture under:

```text
alzan-be/src/components/activity-import/__fixtures__/
```

2. Add or update the fixture entry in:

```text
alzan-be/src/components/activity-import/__fixtures__/manifest.json
```

3. Include the expected canonical fields that matter for the behavior being tested, such as provider, sport type, duration, kcal, distance, heart rate, zones, laps, route redaction, device or vendor fields.

4. For `.fit` files, commit only redacted derivatives. The fixture spec reads them as binary `Uint8Array`, so native FIT parsing is exercised instead of a UTF-8 mock path.

5. Run:

```bash
pnpm verify:activity-import
```

Do not commit private exports directly. Redact names, IDs, device serials, exact private locations and any other personal data first. If a real public file is unavailable, use a synthetic fixture that follows the official provider shape and mark it accordingly in the manifest.

## Adding a Health Fixture

Health fixtures live in:

```text
alzan-be/src/components/activity-import/__fixtures__/health-manifest.json
```

Each entry declares:

- `provider`: provider mapper to exercise.
- `domain`: `daily_activity`, `sleep`, `recovery`, `cycle`, `metabolic` or `body_measurement`.
- `payload`: the redacted or synthetic provider-shaped input.
- `expected`: the canonical fields that must be preserved.
- `unsupported`: use this only when the provider/domain is intentionally not mapped yet.

API-only providers such as WHOOP, Oura and Ultrahuman should use JSON fixtures that match their official response shape. Do not invent FIT files for providers that do not export FIT.

## Current Redacted Suunto Fixtures

The fixture manifest includes redacted Suunto exports for:

- `running` from JSON with native `DeviceLog.Windows` laps.
- `running` from FIT.
- `cycling` indoor/stationary FIT.
- `football` FIT.
- `gym` FIT.
- `padel` FIT.
- `tennis` FIT.

The Suunto running JSON fixture validates provider-native autolaps. In particular, lap 3 keeps the provider duration `321.9s`, which displays as `5:21/km` for 1 km. These laps must not be recalculated from route points while native laps exist.

## When It Fails

Use the failed provider and spec path as the starting point.

- If `fixtures` fails, the parser output no longer matches `manifest.json` or the fixture expectation is stale.
- If `health_fixtures` fails, inspect `health-manifest.json` and the provider health mapper named in the failure context.
- If a provider spec fails, inspect that provider mapper first.
- If `core` fails, check shared parser behavior before changing provider-specific code.
- If `service` fails, check the payload written to Alzan data models and route-tab selection logic.

After fixing a failure, rerun `pnpm verify:activity-import` before running the repo quality gate.

## External Fixture Source Matrix

Use this matrix when expanding coverage. Prefer committed synthetic fixtures for API-only providers, and use real files only when the source is public, legally reusable, and does not contain private user data.

| Provider | Best fixture source | Use for | Notes |
|---|---|---|---|
| Garmin | Official FIT SDK samples and Garmin Activity/Health API shapes | Running, trail, cycling, swimming, climbing, martial arts, volleyball, strength, health JSON | Garmin FIT exposes sport and sub sport values; explicit run/trail-run sub sport maps to `trail/trail_running`. Do not vendor official SDK samples unless the license is acceptable for the repo. |
| Suunto | User-redacted exports plus Suunto FIT docs | Running, trail, cycling, swimming, hiking, climbing, martial arts, volleyball, football, tennis, padel, gym, strength | Suunto exports workouts as FIT and GPX. FIT contains richer data such as timestamps, heart rate, power and cadence. User-redacted exports are especially valuable for sports like padel and trail. |
| Polar | Polar Flow exports plus AccessLink JSON shapes | Running, trail, cycling, swimming, climbing, martial arts, volleyball, health/recovery | Polar Flow exports sessions as FIT, TCX, CSV or GPX. Explicit trail running text maps to Trail; hiking/walking remains Hiking. |
| Strava | Strava API JSON plus FIT/TCX/GPX upload docs | Running, trail, cycling, hiking, climbing, martial arts, volleyball, tennis, padel, football, strength | Strava supports FIT, TCX and GPX uploads, and its API exposes `sport_type`, streams, laps and zones. `TrailRun` maps to `trail/trail_running`. |
| Fitbit | Fitbit TCX GPS export and Web API JSON shapes | Running/walking GPS, trail by explicit exercise name, climbing, martial arts and volleyball by explicit exercise name, daily activity, sleep, health metrics | Fitbit GPS exercises can be exported as TCX. Non-route data should be API/archive JSON shaped from official docs. |
| WHOOP | Official WHOOP API response samples | Trail by explicit sport name, climbing, martial arts and volleyball by explicit sport name, workout, strain, HR zones, recovery, sleep, body measurements | WHOOP is API-first. Use JSON fixtures from `workout`, `cycle`, `recovery`, `sleep` and `body_measurement`; no FIT file is expected. |
| Oura | Oura API V2/sandbox JSON shapes | Trail by explicit workout activity, climbing, martial arts and volleyball by explicit workout activity, daily activity, sleep, readiness, HR, VO2 max | Oura is API-first. Use sandbox/API-shaped JSON for workouts and health collections. |
| Ultrahuman | Ultrahuman Partner API JSON shape | Trail by explicit activity name, climbing, martial arts and volleyball by explicit activity name, recovery, movement, sleep, HR, HRV, VO2 max, CGM when needed | Ultrahuman is API-first. The public docs describe categories more than full sample payloads, so keep fixtures synthetic and source-labeled. |
| Apple Health/Fitness | Apple Health `export.xml` and Health Auto Export JSON | Workouts including explicit trail text, climbing, volleyball, boxing/martial arts, routes, HR, steps, sleep, health samples | Native Apple export is XML. HealthKit exposes running and hiking but no dedicated Trail enum, so only explicit exported text such as Trail Run maps to Trail. |
| Health Connect | Android `ExerciseSessionRecord` plus associated records | Android workouts including explicit trail text, climbing, volleyball, boxing/martial arts, routes, HR, speed, distance, calories, laps, segments | Health Connect exposes running and hiking but no dedicated Trail enum, so only explicit payload text such as Trail Run maps to Trail. |
| COROS | COROS user-redacted exports or API-shaped JSON | Running, trail, cycling, climbing, martial arts, volleyball, strength, health | Public file samples are thinner than Garmin/Suunto. Explicit trail running text maps to Trail; hiking/walking remains Hiking. |

## Coverage Priority

The next useful fixture additions are:

1. User-redacted Suunto FIT files for `running`, `cycling`, `football`, `tennis`, `padel` and `gym`, using the local exports before committing only after redaction.
2. Public real FIT samples for generic FIT behavior: official FIT SDK activity, pool swim, chained swim HR, developer fields and low battery cases.
3. Strava/API-shaped JSON for every Alzan sport where `sport_type` or explicit activity names exist: `Run`, `TrailRun`, `Ride`, `Swim`, `Hike`, `RockClimbing`, `Bouldering`, `Soccer`, `Basketball`, `Tennis`, `Padel`, `Volleyball`, `Boxing`, `MartialArts`, `WeightTraining`, `Workout`.
4. Health fixtures per domain, not per sport: sleep, daily activity, HR/HRV, recovery/readiness, body composition, VO2 max and SpO2.

Do not try to create a full Cartesian matrix of every provider and every sport. Some providers do not support every sport, and many health providers do not export activity files at all. The useful goal is one fixture per behavior we can break.
