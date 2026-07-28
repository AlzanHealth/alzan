export const TRAINING_PLAN_IMPORT_FORMAT = 'alzan-training-plan';
export const TRAINING_PLAN_IMPORT_VERSION = 1;
export const TRAINING_PLAN_IMPORT_MAX_TEXT_LENGTH = 300_000;
export const TRAINING_PLAN_IMPORT_MAX_SESSIONS = 500;

export const TRAINING_PLAN_SPORTS = ['running', 'strength'] as const;
export type TrainingPlanSport = (typeof TRAINING_PLAN_SPORTS)[number];

export type TrainingPlanRunningStep = {
  phase_type: 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'relax';
  duration_type: 'time' | 'distance' | 'lap_button';
  duration_s?: number;
  distance_m?: number;
  target_type?: 'pace' | 'speed' | 'heart_rate' | 'heart_rate_zone' | 'power' | 'rpe' | 'none';
  target_min?: number;
  target_max?: number;
  repetitions?: number;
  progression_key?: string;
  children?: TrainingPlanRunningStep[];
};

export type TrainingPlanStrengthExercise = {
  exercise_id?: string;
  exercise_name?: string;
  order_index: number;
  is_warmup?: boolean;
  sets: number;
  reps?: number;
  reps_min?: number;
  reps_max?: number;
  weight_kg?: number;
  rpe?: number;
  rest_seconds?: number;
  notes?: string;
};

export type TrainingPlanSession = {
  date: string;
  sport: TrainingPlanSport;
  name: string;
  template_key?: string;
  workout_goal?: string;
  modality?: string;
  notes?: string;
  distance_km?: number;
  duration_min?: number;
  running_steps?: TrainingPlanRunningStep[];
  exercises?: TrainingPlanStrengthExercise[];
};

export type TrainingPlanWeek = {
  week_number: number;
  sessions: TrainingPlanSession[];
};

export type TrainingPlanImportDocument = {
  format: typeof TRAINING_PLAN_IMPORT_FORMAT;
  version: typeof TRAINING_PLAN_IMPORT_VERSION;
  plan_name: string;
  start_date: string;
  end_date?: string;
  weeks: TrainingPlanWeek[];
};

export type TrainingPlanValidationErrorCode =
  | 'invalid_json'
  | 'text_too_long'
  | 'invalid_type'
  | 'missing_field'
  | 'unknown_property'
  | 'unsupported_format'
  | 'unsupported_version'
  | 'invalid_length'
  | 'invalid_date'
  | 'duplicate_date'
  | 'unsupported_sport'
  | 'invalid_range'
  | 'invalid_session_shape'
  | 'too_many_sessions';

export type TrainingPlanValidationError = {
  code: TrainingPlanValidationErrorCode;
  path: string;
  message: string;
};

export type TrainingPlanParseResult =
  | { ok: true; value: TrainingPlanImportDocument }
  | { ok: false; errors: TrainingPlanValidationError[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROOT_KEYS = ['format', 'version', 'plan_name', 'start_date', 'end_date', 'weeks'];
const WEEK_KEYS = ['week_number', 'sessions'];
const SESSION_KEYS = [
  'date',
  'sport',
  'name',
  'template_key',
  'workout_goal',
  'modality',
  'notes',
  'distance_km',
  'duration_min',
  'running_steps',
  'exercises',
];
const RUNNING_STEP_KEYS = [
  'phase_type',
  'duration_type',
  'duration_s',
  'distance_m',
  'target_type',
  'target_min',
  'target_max',
  'repetitions',
  'progression_key',
  'children',
];
const EXERCISE_KEYS = [
  'exercise_id',
  'exercise_name',
  'order_index',
  'is_warmup',
  'sets',
  'reps',
  'reps_min',
  'reps_max',
  'weight_kg',
  'rpe',
  'rest_seconds',
  'notes',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRealDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const addError = (
  errors: TrainingPlanValidationError[],
  code: TrainingPlanValidationErrorCode,
  path: string,
  message: string,
) => errors.push({ code, path, message });

const addUnknownKeys = (
  value: Record<string, unknown>,
  allowed: string[],
  path: string,
  errors: TrainingPlanValidationError[],
) => {
  Object.keys(value).forEach(key => {
    if (!allowed.includes(key))
      addError(errors, 'unknown_property', path ? `${path}.${key}` : key, `Unknown property "${key}"`);
  });
};

const readString = (
  value: unknown,
  path: string,
  errors: TrainingPlanValidationError[],
  required = false,
): string | undefined => {
  if (value === undefined || value === null) {
    if (required) addError(errors, 'missing_field', path, 'Required field is missing');
    return undefined;
  }
  if (typeof value !== 'string') {
    addError(errors, 'invalid_type', path, 'Expected a string');
    return undefined;
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) addError(errors, 'invalid_length', path, 'Expected a non-empty string');
  if (trimmed.length > 240) addError(errors, 'invalid_length', path, 'String is too long');
  return trimmed || undefined;
};

const readNumber = (
  value: unknown,
  path: string,
  errors: TrainingPlanValidationError[],
  min = 0,
  max = 100_000,
): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    addError(errors, 'invalid_range', path, `Expected a number between ${min} and ${max}`);
    return undefined;
  }
  return value;
};

const parseStep = (
  value: unknown,
  path: string,
  errors: TrainingPlanValidationError[],
): TrainingPlanRunningStep | null => {
  if (!isRecord(value)) {
    addError(errors, 'invalid_type', path, 'Expected an object');
    return null;
  }
  addUnknownKeys(value, RUNNING_STEP_KEYS, path, errors);
  const phase = readString(value.phase_type, `${path}.phase_type`, errors, true);
  if (phase && !['warmup', 'interval', 'recovery', 'cooldown', 'relax'].includes(phase))
    addError(errors, 'invalid_session_shape', `${path}.phase_type`, 'Unsupported phase type');
  const durationType = value.duration_type;
  if (typeof durationType !== 'string' || !['time', 'distance', 'lap_button'].includes(durationType))
    addError(errors, 'invalid_session_shape', `${path}.duration_type`, 'Unsupported duration type');
  const duration = readNumber(value.duration_s, `${path}.duration_s`, errors, 0, 86_400);
  const distance = readNumber(value.distance_m, `${path}.distance_m`, errors, 0, 500_000);
  const targetType = value.target_type;
  if (
    targetType !== undefined &&
    !['pace', 'speed', 'heart_rate', 'heart_rate_zone', 'power', 'rpe', 'none'].includes(String(targetType))
  ) {
    addError(errors, 'invalid_session_shape', `${path}.target_type`, 'Unsupported target type');
  }
  const childrenRaw = value.children;
  const children: TrainingPlanRunningStep[] = [];
  if (childrenRaw !== undefined) {
    if (!Array.isArray(childrenRaw)) addError(errors, 'invalid_type', `${path}.children`, 'Expected an array');
    else
      childrenRaw.forEach((child, index) => {
        const parsed = parseStep(child, `${path}.children[${index}]`, errors);
        if (parsed) children.push(parsed);
      });
  }
  if (
    !phase ||
    !['warmup', 'interval', 'recovery', 'cooldown', 'relax'].includes(phase) ||
    typeof durationType !== 'string' ||
    !['time', 'distance', 'lap_button'].includes(durationType)
  )
    return null;
  return {
    phase_type: phase as TrainingPlanRunningStep['phase_type'],
    duration_type: durationType as TrainingPlanRunningStep['duration_type'],
    ...(duration === undefined ? {} : { duration_s: duration }),
    ...(distance === undefined ? {} : { distance_m: distance }),
    ...(typeof targetType === 'string' ? { target_type: targetType as TrainingPlanRunningStep['target_type'] } : {}),
    ...(readNumber(value.target_min, `${path}.target_min`, errors, 0, 100_000) === undefined
      ? {}
      : { target_min: value.target_min as number }),
    ...(readNumber(value.target_max, `${path}.target_max`, errors, 0, 100_000) === undefined
      ? {}
      : { target_max: value.target_max as number }),
    ...(readNumber(value.repetitions, `${path}.repetitions`, errors, 1, 1000) === undefined
      ? {}
      : { repetitions: value.repetitions as number }),
    ...(readString(value.progression_key, `${path}.progression_key`, errors)
      ? { progression_key: readString(value.progression_key, `${path}.progression_key`, errors) }
      : {}),
    ...(children.length > 0 ? { children } : {}),
  };
};

const parseExercise = (
  value: unknown,
  path: string,
  errors: TrainingPlanValidationError[],
): TrainingPlanStrengthExercise | null => {
  if (!isRecord(value)) {
    addError(errors, 'invalid_type', path, 'Expected an object');
    return null;
  }
  addUnknownKeys(value, EXERCISE_KEYS, path, errors);
  const exerciseId = readString(value.exercise_id, `${path}.exercise_id`, errors);
  const exerciseName = readString(value.exercise_name, `${path}.exercise_name`, errors);
  if (!exerciseId && !exerciseName)
    addError(errors, 'missing_field', `${path}.exercise_id`, 'Provide exercise_id or exercise_name');
  const order = readNumber(value.order_index, `${path}.order_index`, errors, 0, 1000);
  const sets = readNumber(value.sets, `${path}.sets`, errors, 1, 100);
  if (order === undefined || sets === undefined || (!exerciseId && !exerciseName)) return null;
  return {
    ...(exerciseId ? { exercise_id: exerciseId } : {}),
    ...(exerciseName ? { exercise_name: exerciseName } : {}),
    order_index: order,
    is_warmup: value.is_warmup === true,
    sets,
    ...(readNumber(value.reps, `${path}.reps`, errors, 1, 1000) === undefined ? {} : { reps: value.reps as number }),
    ...(readNumber(value.reps_min, `${path}.reps_min`, errors, 1, 1000) === undefined
      ? {}
      : { reps_min: value.reps_min as number }),
    ...(readNumber(value.reps_max, `${path}.reps_max`, errors, 1, 1000) === undefined
      ? {}
      : { reps_max: value.reps_max as number }),
    ...(readNumber(value.weight_kg, `${path}.weight_kg`, errors, 0, 1000) === undefined
      ? {}
      : { weight_kg: value.weight_kg as number }),
    ...(readNumber(value.rpe, `${path}.rpe`, errors, 1, 10) === undefined ? {} : { rpe: value.rpe as number }),
    ...(readNumber(value.rest_seconds, `${path}.rest_seconds`, errors, 0, 3600) === undefined
      ? {}
      : { rest_seconds: value.rest_seconds as number }),
    ...(readString(value.notes, `${path}.notes`, errors)
      ? { notes: readString(value.notes, `${path}.notes`, errors) }
      : {}),
  };
};

const parseSession = (
  value: unknown,
  path: string,
  errors: TrainingPlanValidationError[],
): TrainingPlanSession | null => {
  if (!isRecord(value)) {
    addError(errors, 'invalid_type', path, 'Expected an object');
    return null;
  }
  addUnknownKeys(value, SESSION_KEYS, path, errors);
  const date = value.date;
  if (!isRealDate(date)) addError(errors, 'invalid_date', `${path}.date`, 'Expected YYYY-MM-DD');
  const sport = value.sport;
  if (typeof sport !== 'string' || !TRAINING_PLAN_SPORTS.includes(sport as TrainingPlanSport))
    addError(errors, 'unsupported_sport', `${path}.sport`, 'Only running and strength are supported');
  const name = readString(value.name, `${path}.name`, errors, true);
  if (
    !isRealDate(date) ||
    typeof sport !== 'string' ||
    !TRAINING_PLAN_SPORTS.includes(sport as TrainingPlanSport) ||
    !name
  )
    return null;
  const runningSteps = Array.isArray(value.running_steps)
    ? value.running_steps
        .map((step, index) => parseStep(step, `${path}.running_steps[${index}]`, errors))
        .filter((step): step is TrainingPlanRunningStep => step !== null)
    : undefined;
  if (value.running_steps !== undefined && !Array.isArray(value.running_steps))
    addError(errors, 'invalid_type', `${path}.running_steps`, 'Expected an array');
  const exercises = Array.isArray(value.exercises)
    ? value.exercises
        .map((exercise, index) => parseExercise(exercise, `${path}.exercises[${index}]`, errors))
        .filter((exercise): exercise is TrainingPlanStrengthExercise => exercise !== null)
    : undefined;
  if (value.exercises !== undefined && !Array.isArray(value.exercises))
    addError(errors, 'invalid_type', `${path}.exercises`, 'Expected an array');
  if (sport === 'running' && (!runningSteps || runningSteps.length === 0))
    addError(errors, 'invalid_session_shape', `${path}.running_steps`, 'Running sessions need at least one step');
  if (sport === 'strength' && (!exercises || exercises.length === 0))
    addError(errors, 'invalid_session_shape', `${path}.exercises`, 'Strength sessions need at least one exercise');
  return {
    date,
    sport: sport as TrainingPlanSport,
    name,
    ...(readString(value.template_key, `${path}.template_key`, errors)
      ? { template_key: readString(value.template_key, `${path}.template_key`, errors) }
      : {}),
    ...(readString(value.workout_goal, `${path}.workout_goal`, errors)
      ? { workout_goal: readString(value.workout_goal, `${path}.workout_goal`, errors) }
      : {}),
    ...(readString(value.modality, `${path}.modality`, errors)
      ? { modality: readString(value.modality, `${path}.modality`, errors) }
      : {}),
    ...(readString(value.notes, `${path}.notes`, errors)
      ? { notes: readString(value.notes, `${path}.notes`, errors) }
      : {}),
    ...(readNumber(value.distance_km, `${path}.distance_km`, errors, 0, 1000) === undefined
      ? {}
      : { distance_km: value.distance_km as number }),
    ...(readNumber(value.duration_min, `${path}.duration_min`, errors, 0, 1440) === undefined
      ? {}
      : { duration_min: value.duration_min as number }),
    ...(runningSteps ? { running_steps: runningSteps } : {}),
    ...(exercises ? { exercises } : {}),
  };
};

export const parseTrainingPlanJson = (rawText: string): TrainingPlanParseResult => {
  if (rawText.length > TRAINING_PLAN_IMPORT_MAX_TEXT_LENGTH)
    return { ok: false, errors: [{ code: 'text_too_long', path: '$', message: 'JSON is too long' }] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, errors: [{ code: 'invalid_json', path: '$', message: 'Invalid JSON' }] };
  }
  const errors: TrainingPlanValidationError[] = [];
  if (!isRecord(parsed))
    return { ok: false, errors: [{ code: 'invalid_type', path: '$', message: 'Expected an object' }] };
  addUnknownKeys(parsed, ROOT_KEYS, '', errors);
  if (parsed.format !== TRAINING_PLAN_IMPORT_FORMAT)
    addError(errors, 'unsupported_format', 'format', `Expected ${TRAINING_PLAN_IMPORT_FORMAT}`);
  if (parsed.version !== TRAINING_PLAN_IMPORT_VERSION)
    addError(errors, 'unsupported_version', 'version', 'Unsupported version');
  const planName = readString(parsed.plan_name, 'plan_name', errors, true);
  const startDate = parsed.start_date;
  if (!isRealDate(startDate)) addError(errors, 'invalid_date', 'start_date', 'Expected YYYY-MM-DD');
  const endDate = parsed.end_date === undefined ? undefined : isRealDate(parsed.end_date) ? parsed.end_date : undefined;
  if (parsed.end_date !== undefined && endDate === undefined)
    addError(errors, 'invalid_date', 'end_date', 'Expected YYYY-MM-DD');
  if (endDate && isRealDate(startDate) && endDate < startDate)
    addError(errors, 'invalid_range', 'end_date', 'End date must not precede start date');
  if (!Array.isArray(parsed.weeks) || parsed.weeks.length < 1)
    addError(errors, 'invalid_length', 'weeks', 'At least one week is required');
  const weeks: TrainingPlanWeek[] = [];
  const sessionKeys = new Set<string>();
  let sessionCount = 0;
  if (Array.isArray(parsed.weeks))
    parsed.weeks.forEach((rawWeek, weekIndex) => {
      if (!isRecord(rawWeek)) {
        addError(errors, 'invalid_type', `weeks[${weekIndex}]`, 'Expected an object');
        return;
      }
      addUnknownKeys(rawWeek, WEEK_KEYS, `weeks[${weekIndex}]`, errors);
      const weekNumber = readNumber(rawWeek.week_number, `weeks[${weekIndex}].week_number`, errors, 1, 104);
      if (weekNumber === undefined || !Array.isArray(rawWeek.sessions)) {
        addError(errors, 'invalid_type', `weeks[${weekIndex}].sessions`, 'Expected an array');
        return;
      }
      const sessions = rawWeek.sessions
        .map((session, sessionIndex) => parseSession(session, `weeks[${weekIndex}].sessions[${sessionIndex}]`, errors))
        .filter((session): session is TrainingPlanSession => session !== null);
      sessions.forEach(session => {
        // More than one workout can be planned on a day. Only the same sport
        // and template family is considered a duplicate slot.
        const sessionKey = `${session.date}:${session.sport}:${session.template_key ?? session.name}`;
        if (sessionKeys.has(sessionKey))
          addError(errors, 'duplicate_date', `weeks[${weekIndex}].sessions`, `Duplicate session slot ${sessionKey}`);
        sessionKeys.add(sessionKey);
        if (isRealDate(startDate) && session.date < startDate)
          addError(
            errors,
            'invalid_range',
            `weeks[${weekIndex}].sessions`,
            `Session ${session.date} is before start_date`,
          );
        if (endDate && session.date > endDate)
          addError(
            errors,
            'invalid_range',
            `weeks[${weekIndex}].sessions`,
            `Session ${session.date} is after end_date`,
          );
      });
      sessionCount += sessions.length;
      weeks.push({ week_number: weekNumber, sessions });
    });
  if (sessionCount > TRAINING_PLAN_IMPORT_MAX_SESSIONS)
    addError(errors, 'too_many_sessions', 'weeks', 'Too many sessions');
  if (errors.length > 0 || !planName || !isRealDate(startDate)) return { ok: false, errors };
  return {
    ok: true,
    value: {
      format: TRAINING_PLAN_IMPORT_FORMAT,
      version: TRAINING_PLAN_IMPORT_VERSION,
      plan_name: planName,
      start_date: startDate,
      ...(endDate ? { end_date: endDate } : {}),
      weeks,
    },
  };
};
