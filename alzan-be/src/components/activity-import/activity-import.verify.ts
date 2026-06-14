import { spawnSync } from 'child_process';
import { basename, resolve } from 'path';

type VerificationCase = {
  kind: 'activity' | 'health' | 'service';
  provider: string;
  check: string;
  specFile: string;
};

type VerificationResult = VerificationCase & {
  durationMs: number;
  error?: string;
  exitCode: number | null;
};

type FailureSummary = {
  provider: string;
  kind: string;
  sportOrDomain: string;
  fixture: string;
  spec: string;
  message: string;
};

const packageRoot = resolve(__dirname, '../../..');

const verificationCases: VerificationCase[] = [
  {
    kind: 'activity',
    provider: 'fixtures',
    check: 'manifest fixtures normalize to the expected canonical activity',
    specFile: 'src/components/activity-import/parsers/activity-import-fixtures.spec.ts',
  },
  {
    kind: 'health',
    provider: 'health_fixtures',
    check: 'health fixture manifest maps provider payloads to canonical health models',
    specFile: 'src/components/activity-import/parsers/activity-import-health-fixtures.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'core',
    check: 'route, strength and native-lap parser behavior',
    specFile: 'src/components/activity-import/parsers/activity-import.parsers.spec.ts',
  },
  {
    kind: 'service',
    provider: 'service',
    check: 'persistence payloads, route tabs and imported strength data',
    specFile: 'src/components/activity-import/activity-import.service.spec.ts',
  },
  {
    kind: 'service',
    provider: 'matching',
    check: 'endurance template match scoring (structural and totals)',
    specFile: 'src/components/activity-import/matching/endurance-template-match.spec.ts',
  },
  {
    kind: 'service',
    provider: 'matching',
    check: 'duplicate similarity scoring for endurance and strength sessions',
    specFile: 'src/components/activity-import/matching/duplicate-score.spec.ts',
  },
  {
    kind: 'service',
    provider: 'matching',
    check: 'import reconciliation decision plans (strength cases and endurance duplicates)',
    specFile: 'src/components/activity-import/matching/reconciliation-plan.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'apple_health',
    check: 'Apple Health/Fitness activity and strength canonical mapping',
    specFile: 'src/components/activity-import/parsers/apple-health-canonical.mapper.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'coros',
    check: 'COROS activity, health and strength canonical mapping',
    specFile: 'src/components/activity-import/parsers/coros-canonical.mapper.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'fitbit',
    check: 'Fitbit activity, health and strength canonical mapping',
    specFile: 'src/components/activity-import/parsers/fitbit-canonical.mapper.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'garmin',
    check: 'Garmin FIT/JSON activity, health and strength canonical mapping',
    specFile: 'src/components/activity-import/parsers/garmin-canonical.mapper.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'health_connect',
    check: 'Health Connect activity, health and strength canonical mapping',
    specFile: 'src/components/activity-import/parsers/health-connect-canonical.mapper.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'oura',
    check: 'Oura activity, health and strength canonical mapping',
    specFile: 'src/components/activity-import/parsers/oura-canonical.mapper.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'polar',
    check: 'Polar activity, health and strength canonical mapping',
    specFile: 'src/components/activity-import/parsers/polar-canonical.mapper.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'strava',
    check: 'Strava activity, health and strength canonical mapping',
    specFile: 'src/components/activity-import/parsers/strava-canonical.mapper.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'suunto',
    check: 'Suunto FIT/JSON activity, health, strength and native laps',
    specFile: 'src/components/activity-import/parsers/suunto-canonical.mapper.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'ultrahuman',
    check: 'Ultrahuman health and activity canonical mapping',
    specFile: 'src/components/activity-import/parsers/ultrahuman-canonical.mapper.spec.ts',
  },
  {
    kind: 'activity',
    provider: 'whoop',
    check: 'WHOOP workout, recovery, sleep and cycle canonical mapping',
    specFile: 'src/components/activity-import/parsers/whoop-canonical.mapper.spec.ts',
  },
];

type VerificationFilters = {
  provider?: string;
  fixture?: string;
  kind?: 'activity' | 'health';
};

const parseFilters = (argv: string[]): VerificationFilters => {
  const filters: VerificationFilters = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const nextValue = argv[index + 1];

    if (value === '--provider' && nextValue) {
      filters.provider = nextValue;
      index += 1;
    } else if (value.startsWith('--provider=')) {
      filters.provider = value.split('=')[1];
    } else if (value === '--fixture' && nextValue) {
      filters.fixture = nextValue;
      index += 1;
    } else if (value.startsWith('--fixture=')) {
      filters.fixture = value.split('=')[1];
    } else if (value === '--kind' && (nextValue === 'activity' || nextValue === 'health')) {
      filters.kind = nextValue;
      index += 1;
    } else if (value === '--kind=activity' || value === '--kind=health') {
      filters.kind = value.replace('--kind=', '') as VerificationFilters['kind'];
    }
  }

  return filters;
};

const shouldRunFixtureCase = (testCase: VerificationCase): boolean =>
  testCase.provider === 'fixtures' || testCase.provider === 'health_fixtures';

const shouldRunCase = (testCase: VerificationCase, filters: VerificationFilters): boolean => {
  if (filters.fixture) return shouldRunFixtureCase(testCase);
  if (filters.kind && testCase.kind !== filters.kind) return false;
  if (!filters.provider) return true;
  return testCase.provider === filters.provider || shouldRunFixtureCase(testCase);
};

const applyFilters = (testCases: VerificationCase[], filters: VerificationFilters): VerificationCase[] =>
  testCases.filter(testCase => shouldRunCase(testCase, filters));

const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
};

const truncateOutput = (output: string, maxLength = 6000): string => {
  const trimmed = output.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}\n... output truncated ...`;
};

const getFailureOutput = (stdout: string, stderr: string): string => {
  const blocks = [
    stdout.trim() ? `stdout:\n${truncateOutput(stdout)}` : '',
    stderr.trim() ? `stderr:\n${truncateOutput(stderr)}` : '',
  ].filter(Boolean);

  return blocks.join('\n\n') || 'No process output was captured.';
};

const runVerificationCase = (testCase: VerificationCase): VerificationResult => {
  const startedAt = Date.now();
  const specPath = resolve(packageRoot, testCase.specFile);
  const result = spawnSync(process.execPath, ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', specPath], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: process.env,
  });
  const durationMs = Date.now() - startedAt;

  if (result.status === 0) {
    return {
      ...testCase,
      durationMs,
      exitCode: result.status,
    };
  }

  const output = getFailureOutput(result.stdout ?? '', result.stderr ?? '');
  const spawnError = result.error ? `\nspawn error: ${result.error.message}` : '';

  return {
    ...testCase,
    durationMs,
    error: `${output}${spawnError}`,
    exitCode: result.status,
  };
};

const printCaseHeader = (testCase: VerificationCase): void => {
  console.log(`[RUN] ${testCase.provider} (${testCase.kind}) - ${testCase.check}`);
};

const printSuccess = (result: VerificationResult): void => {
  console.log(
    `[PASS] ${result.provider} ${result.kind} (${basename(result.specFile)}) ${formatDuration(result.durationMs)}`,
  );
};

const printFailure = (result: VerificationResult): void => {
  console.log('');
  console.log(`[FAIL] provider=${result.provider}`);
  console.log(`kind=${result.kind}`);
  console.log(`check=${result.check}`);
  console.log(`spec=${result.specFile}`);
  console.log(`exitCode=${result.exitCode ?? 'unknown'}`);
  console.log(`duration=${formatDuration(result.durationMs)}`);
  console.log('');
  console.log(result.error);
  console.log('');
};

const extractFailureSummary = (result: VerificationResult): FailureSummary => {
  const error = result.error ?? '';
  const contextMatch = error.match(
    /([a-z0-9_-]+) provider=([a-z0-9_]+) (sport|domain)=([a-z0-9_]+).*?(?:field=([^\s\n]+))?/i,
  );
  const assertionLine =
    error
      .split('\n')
      .map(line => line.trim())
      .find(line => line.includes('AssertionError') || line.includes('expected=') || line.includes('expectedMin=')) ??
    result.check;
  const fixture = contextMatch?.[1] ?? '-';
  const provider = contextMatch?.[2] ?? result.provider;
  const sportOrDomain = contextMatch?.[4] ?? '-';
  const failedField = contextMatch?.[5] ? `field=${contextMatch[5]}; ` : '';

  return {
    provider,
    kind: result.kind,
    sportOrDomain,
    fixture,
    spec: basename(result.specFile),
    message: `${failedField}${assertionLine}`.replace(/\s+/g, ' ').slice(0, 220),
  };
};

const printFailedSummaryTable = (failedResults: VerificationResult[]): void => {
  console.log('Failed checks:');
  console.log('| Provider | Kind | Sport/domain | Fixture | Spec | Message |');
  console.log('|---|---|---|---|---|---|');

  for (const result of failedResults) {
    const summary = extractFailureSummary(result);
    console.log(
      `| ${summary.provider} | ${summary.kind} | ${summary.sportOrDomain} | ${summary.fixture} | ${summary.spec} | ${summary.message} |`,
    );
  }
};

const main = (): void => {
  const filters = parseFilters(process.argv.slice(2));
  process.env.ACTIVITY_IMPORT_PROVIDER_FILTER = filters.provider ?? '';
  process.env.ACTIVITY_IMPORT_FIXTURE_FILTER = filters.fixture ?? '';
  process.env.ACTIVITY_IMPORT_KIND_FILTER = filters.kind ?? '';
  const selectedCases = applyFilters(verificationCases, filters);

  console.log('Activity import verification');
  console.log(`Running ${selectedCases.length} provider/integration checks from alzan-be`);
  if (filters.provider || filters.fixture || filters.kind) {
    console.log(
      `Filters: provider=${filters.provider ?? '*'} fixture=${filters.fixture ?? '*'} kind=${filters.kind ?? '*'}`,
    );
  }
  console.log('');

  if (selectedCases.length === 0) {
    console.log('No activity import checks matched the provided filters.');
    process.exitCode = 1;
    return;
  }

  const results: VerificationResult[] = [];

  for (const testCase of selectedCases) {
    printCaseHeader(testCase);
    const result = runVerificationCase(testCase);
    results.push(result);

    if (result.error) {
      printFailure(result);
      continue;
    }

    printSuccess(result);
  }

  const failedResults = results.filter(result => result.error);
  const passedCount = results.length - failedResults.length;

  console.log('');
  console.log('Activity import verification summary');
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedResults.length}`);
  console.log(`Total: ${results.length}`);

  if (failedResults.length > 0) {
    console.log('');
    printFailedSummaryTable(failedResults);
    process.exitCode = 1;
  }
};

main();
