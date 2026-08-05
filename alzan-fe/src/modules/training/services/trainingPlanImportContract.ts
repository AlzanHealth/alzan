import { getImportedTemplateFamilyKey, getTrainingPlanSessionSignature } from './trainingPlanImportPlanner';
import { getProgressionWeekIndex } from '../helpers/enduranceProgression.helper';
import { resolveTrainingImportMetadata } from '../helpers/trainingPlanImportMetadata.helper';

export const TRAINING_PLAN_IMPORT_FORMAT = 'alzan-training-plan';
export const TRAINING_PLAN_IMPORT_VERSION = 1;
export const TRAINING_PLAN_IMPORT_MAX_TEXT_LENGTH = 300_000;
export const TRAINING_PLAN_IMPORT_MAX_SESSIONS = 500;
export const TRAINING_PLAN_IMPORT_MAX_DAYS = 45;
export const TRAINING_PLAN_IMPORT_MAX_STEPS_PER_LEVEL = 100;
export const TRAINING_PLAN_IMPORT_MAX_STEP_DEPTH = 8;
export const TRAINING_PLAN_IMPORT_MAX_EXERCISES_PER_SESSION = 100;

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
  weekday?: string;
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
  end_date: string;
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
  | 'invalid_session_metadata'
  | 'weekday_mismatch'
  | 'incompatible_template_family'
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOT_KEYS = ['format', 'version', 'plan_name', 'start_date', 'end_date', 'weeks'];
const WEEK_KEYS = ['week_number', 'sessions'];
const SESSION_KEYS = [
  'date',
  'weekday',
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
  'rir',
  'rir_min',
  'rir_max',
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

const WEEKDAY_ALIASES: Record<string, string> = {
  domingo: 'domingo',
  sunday: 'domingo',
  lunes: 'lunes',
  monday: 'lunes',
  martes: 'martes',
  tuesday: 'martes',
  miercoles: 'miércoles',
  miércoles: 'miércoles',
  wednesday: 'miércoles',
  jueves: 'jueves',
  thursday: 'jueves',
  viernes: 'viernes',
  friday: 'viernes',
  sabado: 'sábado',
  sábado: 'sábado',
  saturday: 'sábado',
};

const normalizeWeekday = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const getWeekdayForDate = (date: string): string =>
  ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][
    new Date(`${date}T00:00:00.000Z`).getUTCDay()
  ];

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

const readInteger = (
  value: unknown,
  path: string,
  errors: TrainingPlanValidationError[],
  min = 0,
  max = 100_000,
): number | undefined => {
  const parsed = readNumber(value, path, errors, min, max);
  if (parsed !== undefined && !Number.isInteger(parsed)) {
    addError(errors, 'invalid_range', path, `Expected an integer between ${min} and ${max}`);
    return undefined;
  }
  return parsed;
};

const parseStep = (
  value: unknown,
  path: string,
  errors: TrainingPlanValidationError[],
  depth = 0,
): TrainingPlanRunningStep | null => {
  if (depth >= TRAINING_PLAN_IMPORT_MAX_STEP_DEPTH) {
    addError(
      errors,
      'invalid_length',
      path,
      `Running steps cannot exceed ${TRAINING_PLAN_IMPORT_MAX_STEP_DEPTH} nested levels`,
    );
    return null;
  }
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
  const duration = readInteger(value.duration_s, `${path}.duration_s`, errors, 0, 86_400);
  const distance = readInteger(value.distance_m, `${path}.distance_m`, errors, 0, 500_000);
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
    else {
      if (childrenRaw.length > TRAINING_PLAN_IMPORT_MAX_STEPS_PER_LEVEL) {
        addError(
          errors,
          'invalid_length',
          `${path}.children`,
          `A running step cannot contain more than ${TRAINING_PLAN_IMPORT_MAX_STEPS_PER_LEVEL} children`,
        );
      }
      childrenRaw.slice(0, TRAINING_PLAN_IMPORT_MAX_STEPS_PER_LEVEL).forEach((child, index) => {
        const parsed = parseStep(child, `${path}.children[${index}]`, errors, depth + 1);
        if (parsed) children.push(parsed);
      });
    }
  }
  if (
    !phase ||
    !['warmup', 'interval', 'recovery', 'cooldown', 'relax'].includes(phase) ||
    typeof durationType !== 'string' ||
    !['time', 'distance', 'lap_button'].includes(durationType)
  )
    return null;
  if (children.length === 0 && durationType === 'time' && duration === undefined) {
    addError(errors, 'invalid_session_shape', `${path}.duration_s`, 'A time step requires duration_s');
  }
  if (children.length === 0 && durationType === 'distance' && distance === undefined) {
    addError(errors, 'invalid_session_shape', `${path}.distance_m`, 'A distance step requires distance_m');
  }
  const targetMin = readNumber(value.target_min, `${path}.target_min`, errors, 0, 100_000);
  const targetMax = readNumber(value.target_max, `${path}.target_max`, errors, 0, 100_000);
  const hasValidTargetType =
    typeof targetType === 'string' &&
    ['pace', 'speed', 'heart_rate', 'heart_rate_zone', 'power', 'rpe', 'none'].includes(targetType);
  if ((targetMin !== undefined || targetMax !== undefined) && (!hasValidTargetType || targetType === 'none')) {
    addError(
      errors,
      'invalid_session_shape',
      `${path}.target_type`,
      'A target range requires a target_type other than none',
    );
  }
  if (hasValidTargetType && targetType !== 'none' && targetMin === undefined) {
    addError(errors, 'missing_field', `${path}.target_min`, 'A target_type requires target_min');
  }
  if (targetMax !== undefined && targetMin === undefined) {
    addError(errors, 'invalid_session_shape', `${path}.target_min`, 'target_max requires target_min');
  }
  if (targetMin !== undefined && targetMax !== undefined && targetMin > targetMax) {
    addError(errors, 'invalid_range', `${path}.target_max`, 'target_max must be greater than or equal to target_min');
  }
  const repetitions = readInteger(value.repetitions, `${path}.repetitions`, errors, 1, 1000);
  const progressionKey = readString(value.progression_key, `${path}.progression_key`, errors);
  return {
    phase_type: phase as TrainingPlanRunningStep['phase_type'],
    duration_type: durationType as TrainingPlanRunningStep['duration_type'],
    ...(duration === undefined ? {} : { duration_s: duration }),
    ...(distance === undefined ? {} : { distance_m: distance }),
    ...(typeof targetType === 'string' ? { target_type: targetType as TrainingPlanRunningStep['target_type'] } : {}),
    ...(targetMin === undefined ? {} : { target_min: targetMin }),
    ...(targetMax === undefined ? {} : { target_max: targetMax }),
    ...(repetitions === undefined ? {} : { repetitions }),
    ...(progressionKey ? { progression_key: progressionKey } : {}),
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
  if (exerciseId && !UUID.test(exerciseId))
    addError(errors, 'invalid_session_shape', `${path}.exercise_id`, 'Expected a canonical UUID');
  if (!exerciseId && !exerciseName)
    addError(errors, 'missing_field', `${path}.exercise_id`, 'Provide exercise_id or exercise_name');
  const order = readInteger(value.order_index, `${path}.order_index`, errors, 0, 1000);
  const sets = readInteger(value.sets, `${path}.sets`, errors, 1, 100);
  const reps = readInteger(value.reps, `${path}.reps`, errors, 1, 1000);
  const repsMin = readInteger(value.reps_min, `${path}.reps_min`, errors, 1, 1000);
  const repsMax = readInteger(value.reps_max, `${path}.reps_max`, errors, 1, 1000);
  const restSeconds = readInteger(value.rest_seconds, `${path}.rest_seconds`, errors, 0, 3600);
  if (reps !== undefined && (repsMin !== undefined || repsMax !== undefined)) {
    addError(errors, 'invalid_session_shape', `${path}.reps`, 'Use reps or reps_min/reps_max, not both');
  }
  if ((repsMin === undefined) !== (repsMax === undefined)) {
    addError(errors, 'invalid_session_shape', `${path}.reps_min`, 'Provide both reps_min and reps_max');
  }
  if (repsMin !== undefined && repsMax !== undefined && repsMin > repsMax) {
    addError(errors, 'invalid_range', `${path}.reps_max`, 'reps_max must be greater than or equal to reps_min');
  }
  if (reps === undefined && repsMin === undefined && repsMax === undefined) {
    addError(errors, 'missing_field', `${path}.reps`, 'Provide reps or reps_min and reps_max');
  }
  if (value.is_warmup !== undefined && typeof value.is_warmup !== 'boolean') {
    addError(errors, 'invalid_type', `${path}.is_warmup`, 'Expected a boolean');
  }
  if (order === undefined || sets === undefined || (!exerciseId && !exerciseName)) return null;
  return {
    ...(exerciseId ? { exercise_id: exerciseId } : {}),
    ...(exerciseName ? { exercise_name: exerciseName } : {}),
    order_index: order,
    is_warmup: value.is_warmup === true,
    sets,
    ...(reps === undefined ? {} : { reps }),
    ...(repsMin === undefined ? {} : { reps_min: repsMin }),
    ...(repsMax === undefined ? {} : { reps_max: repsMax }),
    ...(readNumber(value.weight_kg, `${path}.weight_kg`, errors, 0, 1000) === undefined
      ? {}
      : { weight_kg: value.weight_kg as number }),
    ...(readNumber(value.rpe, `${path}.rpe`, errors, 1, 10) === undefined ? {} : { rpe: value.rpe as number }),
    ...(restSeconds === undefined ? {} : { rest_seconds: restSeconds }),
    // Notes are accepted for backwards compatibility but are intentionally not imported.
  };
};

const hasDuplicateProgressionKey = (steps: TrainingPlanRunningStep[], seen = new Set<string>()): boolean => {
  for (const step of steps) {
    if (step.progression_key) {
      if (seen.has(step.progression_key)) return true;
      seen.add(step.progression_key);
    }
    if (step.children && hasDuplicateProgressionKey(step.children, seen)) return true;
  }
  return false;
};

const getSessionProgressionSignature = (session: TrainingPlanSession): string =>
  JSON.stringify(
    session.sport === 'running'
      ? {
          running_steps: session.running_steps ?? [],
          distance_km: session.distance_km ?? null,
          duration_min: session.duration_min ?? null,
        }
      : (session.exercises ?? []),
  );

const getRunningProgressionKeySignature = (session: TrainingPlanSession): string | null => {
  if (session.sport !== 'running') return null;
  const keys: Array<{ path: string; key: string }> = [];
  const visit = (steps: TrainingPlanRunningStep[], parentPath = '') => {
    steps.forEach((step, index) => {
      const path = parentPath ? `${parentPath}.${index}` : `${index}`;
      keys.push({
        path,
        key: step.progression_key ?? `step_${path.replace(/\./g, '_')}`,
      });
      if (step.children) visit(step.children, path);
    });
  };
  visit(session.running_steps ?? []);
  return JSON.stringify(keys);
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
  const weekdayValue = readString(value.weekday, `${path}.weekday`, errors);
  const normalizedWeekday = weekdayValue ? WEEKDAY_ALIASES[normalizeWeekday(weekdayValue)] : undefined;
  if (weekdayValue && !normalizedWeekday)
    addError(errors, 'invalid_session_shape', `${path}.weekday`, 'Unsupported weekday');
  if (normalizedWeekday && isRealDate(date) && normalizedWeekday !== getWeekdayForDate(date))
    addError(
      errors,
      'weekday_mismatch',
      `${path}.weekday`,
      `Weekday does not match ${date}; expected ${getWeekdayForDate(date)}`,
    );
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
  if (Array.isArray(value.running_steps) && value.running_steps.length > TRAINING_PLAN_IMPORT_MAX_STEPS_PER_LEVEL) {
    addError(
      errors,
      'invalid_length',
      `${path}.running_steps`,
      `A running session cannot contain more than ${TRAINING_PLAN_IMPORT_MAX_STEPS_PER_LEVEL} top-level steps`,
    );
  }
  const runningSteps = Array.isArray(value.running_steps)
    ? value.running_steps
        .slice(0, TRAINING_PLAN_IMPORT_MAX_STEPS_PER_LEVEL)
        .map((step, index) => parseStep(step, `${path}.running_steps[${index}]`, errors))
        .filter((step): step is TrainingPlanRunningStep => step !== null)
    : undefined;
  if (value.running_steps !== undefined && !Array.isArray(value.running_steps))
    addError(errors, 'invalid_type', `${path}.running_steps`, 'Expected an array');
  if (Array.isArray(value.exercises) && value.exercises.length > TRAINING_PLAN_IMPORT_MAX_EXERCISES_PER_SESSION) {
    addError(
      errors,
      'invalid_length',
      `${path}.exercises`,
      `A strength session cannot contain more than ${TRAINING_PLAN_IMPORT_MAX_EXERCISES_PER_SESSION} exercises`,
    );
  }
  const exercises = Array.isArray(value.exercises)
    ? value.exercises
        .slice(0, TRAINING_PLAN_IMPORT_MAX_EXERCISES_PER_SESSION)
        .map((exercise, index) => parseExercise(exercise, `${path}.exercises[${index}]`, errors))
        .filter((exercise): exercise is TrainingPlanStrengthExercise => exercise !== null)
    : undefined;
  if (value.exercises !== undefined && !Array.isArray(value.exercises))
    addError(errors, 'invalid_type', `${path}.exercises`, 'Expected an array');
  if (sport === 'running' && (!runningSteps || runningSteps.length === 0))
    addError(errors, 'invalid_session_shape', `${path}.running_steps`, 'Running sessions need at least one step');
  if (sport === 'running' && value.exercises !== undefined) {
    addError(errors, 'invalid_session_shape', `${path}.exercises`, 'Running sessions cannot contain exercises');
  }
  if (sport === 'running' && runningSteps && hasDuplicateProgressionKey(runningSteps)) {
    addError(
      errors,
      'invalid_session_shape',
      `${path}.running_steps`,
      'progression_key values must be unique within a running session',
    );
  }
  if (sport === 'strength' && (!exercises || exercises.length === 0))
    addError(errors, 'invalid_session_shape', `${path}.exercises`, 'Strength sessions need at least one exercise');
  if (sport === 'strength' && value.running_steps !== undefined) {
    addError(
      errors,
      'invalid_session_shape',
      `${path}.running_steps`,
      'Strength sessions cannot contain running_steps',
    );
  }
  if (sport === 'strength' && exercises) {
    const orderIndexes = exercises.map(exercise => exercise.order_index).sort((left, right) => left - right);
    if (orderIndexes.some((orderIndex, index) => orderIndex !== index)) {
      addError(
        errors,
        'invalid_session_shape',
        `${path}.exercises`,
        'Strength exercise order_index values must be unique and consecutive from 0',
      );
    }
  }
  const templateKey = readString(value.template_key, `${path}.template_key`, errors);
  const rawWorkoutGoal = readString(value.workout_goal, `${path}.workout_goal`, errors);
  const rawModality = readString(value.modality, `${path}.modality`, errors);
  const metadata = resolveTrainingImportMetadata(sport as TrainingPlanSport, rawWorkoutGoal, rawModality);
  if (!metadata.ok) {
    metadata.invalidFields.forEach(field =>
      addError(
        errors,
        'invalid_session_metadata',
        `${path}.${field}`,
        `Unsupported ${field === 'workout_goal' ? 'workout goal' : 'modality'} for ${sport}`,
      ),
    );
  }
  return {
    date,
    ...(normalizedWeekday ? { weekday: normalizedWeekday } : {}),
    sport: sport as TrainingPlanSport,
    name,
    ...(templateKey ? { template_key: templateKey } : {}),
    ...(metadata.ok && metadata.workoutGoal ? { workout_goal: metadata.workoutGoal } : {}),
    ...(metadata.ok ? { modality: metadata.modality } : {}),
    // Notes are accepted for backwards compatibility but are intentionally not imported.
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
  if (parsed.end_date === undefined) addError(errors, 'missing_field', 'end_date', 'Required field is missing');
  else if (endDate === undefined) addError(errors, 'invalid_date', 'end_date', 'Expected YYYY-MM-DD');
  if (endDate && isRealDate(startDate) && endDate < startDate)
    addError(errors, 'invalid_range', 'end_date', 'End date must not precede start date');
  if (endDate && isRealDate(startDate) && endDate >= startDate) {
    const rangeDays =
      (new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / 86_400_000 +
      1;
    if (rangeDays > TRAINING_PLAN_IMPORT_MAX_DAYS)
      addError(errors, 'invalid_range', 'end_date', `Plan cannot exceed ${TRAINING_PLAN_IMPORT_MAX_DAYS} days`);
  }
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
      const weekNumber = readInteger(rawWeek.week_number, `weeks[${weekIndex}].week_number`, errors, 1, 104);
      if (!Array.isArray(rawWeek.sessions)) {
        addError(errors, 'invalid_type', `weeks[${weekIndex}].sessions`, 'Expected an array');
        return;
      }
      const sessions = rawWeek.sessions
        .map((session, sessionIndex) => parseSession(session, `weeks[${weekIndex}].sessions[${sessionIndex}]`, errors))
        .filter((session): session is TrainingPlanSession => session !== null);
      sessions.forEach(session => {
        // More than one workout can be planned on a day. Only the same sport
        // and template family is considered a duplicate slot.
        const sessionKey = `${session.date}:${getImportedTemplateFamilyKey(session)}`;
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
      if (weekNumber !== undefined) weeks.push({ week_number: weekNumber, sessions });
    });
  if (sessionCount < 1) addError(errors, 'invalid_length', 'weeks', 'At least one session is required');
  if (sessionCount > TRAINING_PLAN_IMPORT_MAX_SESSIONS)
    addError(errors, 'too_many_sessions', 'weeks', 'Too many sessions');
  const signaturesByFamily = new Map<string, string>();
  const progressionKeysByFamily = new Map<string, string>();
  const progressionSignaturesByFamilyWeek = new Map<string, string>();
  weeks.forEach((week, weekIndex) => {
    week.sessions.forEach((session, sessionIndex) => {
      const familyKey = getImportedTemplateFamilyKey(session);
      const signature = getTrainingPlanSessionSignature(session);
      const existingSignature = signaturesByFamily.get(familyKey);
      if (existingSignature && existingSignature !== signature) {
        addError(
          errors,
          'incompatible_template_family',
          `weeks[${weekIndex}].sessions[${sessionIndex}].template_key`,
          `Template family "${session.template_key}" contains incompatible workout structures`,
        );
      } else {
        signaturesByFamily.set(familyKey, signature);
      }
      const progressionKeySignature = getRunningProgressionKeySignature(session);
      const existingProgressionKeySignature = progressionKeysByFamily.get(familyKey);
      if (
        progressionKeySignature &&
        existingProgressionKeySignature &&
        progressionKeySignature !== existingProgressionKeySignature
      ) {
        addError(
          errors,
          'incompatible_template_family',
          `weeks[${weekIndex}].sessions[${sessionIndex}].running_steps`,
          `Template family "${session.template_key}" must keep progression_key values stable between sessions`,
        );
      } else if (progressionKeySignature) {
        progressionKeysByFamily.set(familyKey, progressionKeySignature);
      }
      if (isRealDate(startDate)) {
        const progressionWeekIndex = getProgressionWeekIndex(startDate, session.date);
        const familyWeekKey = `${familyKey}:${progressionWeekIndex}`;
        const progressionSignature = getSessionProgressionSignature(session);
        const existingProgressionSignature = progressionSignaturesByFamilyWeek.get(familyWeekKey);
        if (existingProgressionSignature && existingProgressionSignature !== progressionSignature) {
          addError(
            errors,
            'incompatible_template_family',
            `weeks[${weekIndex}].sessions[${sessionIndex}].template_key`,
            `Template family "${session.template_key}" has different targets more than once in the same 7-day block; use distinct template_key values`,
          );
        } else {
          progressionSignaturesByFamilyWeek.set(familyWeekKey, progressionSignature);
        }
      }
    });
  });
  if (errors.length > 0 || !planName || !isRealDate(startDate) || !endDate) return { ok: false, errors };
  return {
    ok: true,
    value: {
      format: TRAINING_PLAN_IMPORT_FORMAT,
      version: TRAINING_PLAN_IMPORT_VERSION,
      plan_name: planName,
      start_date: startDate,
      end_date: endDate,
      weeks,
    },
  };
};
