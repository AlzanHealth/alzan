import { supabase } from '../../../lib/supabaseClient';
import type { EnduranceWorkoutTemplateProgressionInsert } from '../../../types/requests.types';
import { getProgressionWeekIndex, type StepProgressionOverride } from '../helpers/enduranceProgression.helper';
import { replaceEnduranceStepProgressions } from './enduranceProgressionService';
import { expireTrainingTemplates } from './templateLifecycleService';
import {
  findReusableImportedTemplate,
  getImportedTemplateScheduledDay,
  groupTrainingPlanSessions,
  type ImportedTemplateCandidate,
  type ImportedTemplateFamily,
} from './trainingPlanImportPlanner';
import { logTrainingPlanImport, logTrainingPlanImportError } from './trainingPlanImportLogger';
import { buildImportedWorkoutPlans } from './trainingPlanImportCalendar.helper';
import { toImportedProgressionKey } from './trainingPlanImportProgressionKey';
import {
  areTrainingPlanExerciseResolutionsReady,
  getTrainingExerciseResolutionKey,
  resolveTrainingPlanExerciseResolutions as buildTrainingPlanExerciseResolutions,
  resolveTrainingPlanExercisesFromCatalog,
  searchTrainingExerciseCandidates,
  type TrainingExerciseCatalogRow,
  type TrainingExerciseResolution,
} from './trainingPlanImportExerciseResolver';
import { fetchTrainingExerciseAiCatalog } from './trainingPlanAiCatalogService';
import type {
  TrainingPlanImportDocument,
  TrainingPlanRunningStep,
  TrainingPlanStrengthExercise,
} from './trainingPlanImportContract';

type CreatedTemplate = { family: ImportedTemplateFamily; id: string };
type TemplateCreationResult = { id: string; created: boolean };
export type TrainingPlanImportProgress = {
  phase: 'preparing' | 'exercises' | 'templates' | 'calendar' | 'complete';
  percentage: number;
};
type TrainingPlanImportOptions = {
  autoDeleteExpiredTemplates?: boolean;
  onProgress?: (progress: TrainingPlanImportProgress) => void;
  exerciseResolutions?: TrainingExerciseResolution[];
};

const reportImportProgress = (
  options: TrainingPlanImportOptions,
  phase: TrainingPlanImportProgress['phase'],
  percentage: number,
): void => {
  options.onProgress?.({ phase, percentage: Math.max(0, Math.min(100, Math.round(percentage))) });
};

const getDateRange = (document: TrainingPlanImportDocument): { start: string; end: string } => {
  return {
    start: document.start_date,
    end: document.end_date,
  };
};

const rollbackCreatedTemplate = async (userId: string, item: CreatedTemplate): Promise<void> => {
  const failures: Array<{ stage: string; error: unknown }> = [];
  const capture = (stage: string, error: unknown) => {
    if (error) failures.push({ stage, error });
  };
  if (item.family.sport === 'running') {
    // endurance_workout_steps predates the lifecycle feature and its template
    // foreign key does not cascade, so the children must be removed first.
    const { error: stepsError } = await supabase.from('endurance_workout_steps').delete().eq('template_id', item.id);
    capture('running-steps', stepsError);
  }

  const table = item.family.sport === 'running' ? 'endurance_workout_templates' : 'workout_templates';
  const { error: templateError } = await supabase.from(table).delete().eq('id', item.id).eq('user_id', userId);
  capture('template', templateError);

  if (failures.length > 0) {
    for (const failure of failures) {
      logTrainingPlanImportError('rollback:failed', failure.error, {
        stage: failure.stage,
        templateId: item.id,
        sport: item.family.sport,
      });
    }
    return;
  }
  logTrainingPlanImport('rollback:template-removed', {
    templateId: item.id,
    sport: item.family.sport,
  });
};

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

const flattenSteps = (
  steps: TrainingPlanRunningStep[],
  parentPath = '',
): Array<{ step: TrainingPlanRunningStep; key: string; path: string }> => {
  const result: Array<{ step: TrainingPlanRunningStep; key: string; path: string }> = [];
  steps.forEach((step, index) => {
    const path = parentPath ? `${parentPath}.${index}` : `${index}`;
    result.push({ step, key: step.progression_key ?? `step_${path.replace(/\./g, '_')}`, path });
    if (step.children) result.push(...flattenSteps(step.children, path));
  });
  return result;
};

const toRunningStepRow = (
  step: TrainingPlanRunningStep,
  templateId: string,
  orderIndex: number,
  parentStepId: string | null,
  progressionKey: string,
) => ({
  template_id: templateId,
  order_index: orderIndex,
  progression_key: progressionKey,
  phase_type: step.phase_type,
  duration_type: step.duration_type,
  duration_s: step.duration_s ?? null,
  distance_m: step.distance_m ?? null,
  target_type: step.target_type ?? 'none',
  target_min: step.target_min ?? null,
  target_max: step.target_max ?? null,
  repetitions: step.repetitions ?? 1,
  is_group: Boolean(step.children?.length),
  parent_step_id: parentStepId,
});

const buildProgressions = (family: ImportedTemplateFamily, startDate: string): StepProgressionOverride[] => {
  const overridesByWeekAndStep = new Map<string, StepProgressionOverride>();
  for (const session of family.sessions) {
    if (session.sport !== 'running' || !session.running_steps) continue;
    const weekIndex = getProgressionWeekIndex(startDate, session.date);
    if (weekIndex < 1) continue;
    for (const { step, key } of flattenSteps(session.running_steps)) {
      const override: StepProgressionOverride = {
        progression_key: toImportedProgressionKey(family.familyKey, key),
        week_index: weekIndex,
        duration_s: step.duration_s,
        distance_m: step.distance_m,
        target_type: step.target_type,
        target_min: step.target_min,
        target_max: step.target_max,
        repetitions: step.repetitions,
      };
      const overrideKey = `${override.progression_key}:${weekIndex}`;
      const existing = overridesByWeekAndStep.get(overrideKey);
      if (existing && JSON.stringify(existing) !== JSON.stringify(override)) {
        throw new Error(
          `La familia "${family.familyKey}" contiene dos progresiones de running distintas en la semana ${weekIndex}`,
        );
      }
      overridesByWeekAndStep.set(overrideKey, override);
    }
  }
  return [...overridesByWeekAndStep.values()];
};

const buildTemplateSummaryProgressions = (
  templateId: string,
  family: ImportedTemplateFamily,
  startDate: string,
): EnduranceWorkoutTemplateProgressionInsert[] => {
  const summariesByWeek = new Map<number, EnduranceWorkoutTemplateProgressionInsert>();
  for (const session of family.sessions) {
    if (session.sport !== 'running') continue;
    const weekIndex = getProgressionWeekIndex(startDate, session.date);
    if (weekIndex < 1 || (session.distance_km === undefined && session.duration_min === undefined)) continue;

    const summary: EnduranceWorkoutTemplateProgressionInsert = {
      template_id: templateId,
      week_index: weekIndex,
      total_distance_m: session.distance_km === undefined ? null : Math.round(session.distance_km * 1000),
      total_duration_s: session.duration_min === undefined ? null : Math.round(session.duration_min * 60),
    };
    const existing = summariesByWeek.get(weekIndex);
    if (existing && JSON.stringify(existing) !== JSON.stringify(summary)) {
      throw new Error(
        `La familia "${family.familyKey}" contiene dos resúmenes de running distintos en la semana ${weekIndex}`,
      );
    }
    summariesByWeek.set(weekIndex, summary);
  }
  return [...summariesByWeek.values()];
};

const resolveExercises = async (
  exercises: TrainingPlanStrengthExercise[],
  selectedResolutions?: TrainingExerciseResolution[],
): Promise<Map<string, string>> => {
  logTrainingPlanImport('resolve-exercises:start', { requested: exercises.length });
  if (exercises.length === 0) return new Map();
  const catalog = await fetchTrainingExerciseCatalog();
  if (selectedResolutions) {
    if (!areTrainingPlanExerciseResolutionsReady(selectedResolutions)) {
      throw new Error('Todos los ejercicios de fuerza deben estar asociados al catálogo');
    }
    const catalogById = new Map(catalog.map(exercise => [exercise.id, exercise] as const));
    const expectedKeys = new Set(exercises.map(exercise => getTrainingExerciseResolutionKey(exercise)));
    const providedKeys = new Set(selectedResolutions.map(resolution => resolution.resolutionKey));
    if (
      [...expectedKeys].some(key => !providedKeys.has(key)) ||
      [...providedKeys].some(key => !expectedKeys.has(key))
    ) {
      throw new Error('Faltan asociaciones de ejercicios de fuerza para este plan');
    }
    const resolved = new Map<string, string>();
    selectedResolutions.forEach(resolution => {
      const selected = resolution.selectedCandidate;
      if (
        !selected ||
        !catalogById.has(selected.id) ||
        !resolution.candidates.some(candidate => candidate.id === selected.id)
      ) {
        throw new Error(`No se ha encontrado el ejercicio "${resolution.sourceName}"`);
      }
      resolved.set(resolution.resolutionKey, selected.id);
    });
    logTrainingPlanImport('resolve-exercises:complete', { resolved: resolved.size });
    return resolved;
  }
  try {
    const resolved = resolveTrainingPlanExercisesFromCatalog(exercises, catalog);
    logTrainingPlanImport('resolve-exercises:complete', { resolved: resolved.size });
    return resolved;
  } catch (error) {
    logTrainingPlanImportError('resolve-exercises:failed', error, { requested: exercises.length });
    throw error;
  }
};

export const fetchTrainingExerciseCatalog = async (): Promise<TrainingExerciseCatalogRow[]> => {
  const catalog = await fetchTrainingExerciseAiCatalog();
  logTrainingPlanImport('resolve-exercises:catalog-loaded', { catalogSize: catalog.length });
  return catalog.map(exercise => ({
    id: exercise.exercise_id,
    base_name_es: exercise.exercise_name_es,
    base_name_en: exercise.exercise_name_en,
    exercise_type: exercise.exercise_type,
    load_type: exercise.load_type,
    primary_muscle: exercise.primary_muscle,
    secondary_muscle: exercise.secondary_muscle,
    equipment: exercise.equipment,
  }));
};

const getStrengthExercises = (document: TrainingPlanImportDocument): TrainingPlanStrengthExercise[] =>
  document.weeks.flatMap(week =>
    week.sessions.flatMap(session => (session.sport === 'strength' ? (session.exercises ?? []) : [])),
  );

export const resolveTrainingPlanExerciseResolutions = async (
  document: TrainingPlanImportDocument,
): Promise<TrainingExerciseResolution[]> => {
  const exercises = getStrengthExercises(document);
  if (exercises.length === 0) return [];
  const catalog = await fetchTrainingExerciseCatalog();
  const resolutions = buildTrainingPlanExerciseResolutions(exercises, catalog);
  return [...new Map(resolutions.map(resolution => [resolution.resolutionKey, resolution])).values()];
};

export const searchTrainingPlanExerciseCandidates = async (
  query: string,
): Promise<TrainingExerciseResolution['candidates']> => {
  const catalog = await fetchTrainingExerciseCatalog();
  return searchTrainingExerciseCandidates(query, catalog);
};

export const preflightTrainingPlanExercises = async (document: TrainingPlanImportDocument): Promise<void> => {
  const exercises = getStrengthExercises(document);
  if (exercises.length > 0) await resolveExercises(exercises);
};

const createEnduranceTemplate = async (
  userId: string,
  family: ImportedTemplateFamily,
  range: { start: string; end: string },
  options: TrainingPlanImportOptions,
): Promise<TemplateCreationResult> => {
  const first = family.sessions[0];
  logTrainingPlanImport('running-template:create:start', {
    familyKey: family.familyKey,
    sessions: family.sessions.length,
    steps: first.running_steps?.length ?? 0,
  });
  const { data: template, error } = await supabase
    .from('endurance_workout_templates')
    .insert({
      user_id: userId,
      sport_type: 'running',
      base_name: family.name,
      description: first.notes ?? null,
      workout_goal: family.workoutGoal,
      environment_type: family.modality ?? 'outdoor',
      // Imported calendar entries are created from the exact JSON dates below.
      // Never turn an imported family into a recurrence implicitly.
      scheduled_day: null,
      recurrence_start_date: range.start,
      recurrence_end_date: range.end,
      auto_delete_after_end: options.autoDeleteExpiredTemplates ?? true,
      template_family_key: family.familyKey,
      // The row is not reusable until all child rows and progressions exist.
      // This prevents a concurrent import from observing a partial template.
      source: 'importing',
      total_distance_m: first.distance_km === undefined ? null : Math.round(first.distance_km * 1000),
      total_duration_s: first.duration_min === undefined ? null : Math.round(first.duration_min * 60),
    } as never)
    .select('id')
    .single();
  if (error || !template) {
    logTrainingPlanImportError(
      'running-template:create:failed',
      error ?? new Error('No se ha creado la plantilla de running'),
      {
        familyKey: family.familyKey,
      },
    );
    throw error ?? new Error('No se ha creado la plantilla de running');
  }
  logTrainingPlanImport('running-template:created', { familyKey: family.familyKey, templateId: template.id });
  try {
    type PendingStep = {
      step: TrainingPlanRunningStep;
      path: string;
      orderIndex: number;
      parentId: string | null;
    };
    let pendingLevel: PendingStep[] = (first.running_steps ?? []).map((step, index) => ({
      step,
      path: `${index}`,
      orderIndex: index,
      parentId: null,
    }));
    let insertedStepCount = 0;
    const insertBatchSize = 500;
    while (pendingLevel.length > 0) {
      const insertedIdsByProgressionKey = new Map<string, string>();
      for (let offset = 0; offset < pendingLevel.length; offset += insertBatchSize) {
        const batch = pendingLevel.slice(offset, offset + insertBatchSize);
        const rows = batch.map(({ step, path, orderIndex, parentId }) => {
          const rawProgressionKey = step.progression_key ?? `step_${path.replace(/\./g, '_')}`;
          return toRunningStepRow(
            step,
            template.id,
            orderIndex,
            parentId,
            toImportedProgressionKey(family.familyKey, rawProgressionKey),
          );
        });
        const { data: inserted, error: stepError } = await supabase
          .from('endurance_workout_steps')
          .insert(rows)
          .select('id, progression_key');
        if (stepError || !inserted || inserted.length !== rows.length) {
          const insertionError = stepError ?? new Error('No se han creado todos los pasos de running');
          logTrainingPlanImportError('running-steps:create-failed', insertionError, {
            familyKey: family.familyKey,
            rows: rows.length,
            offset,
          });
          throw insertionError;
        }
        inserted.forEach(row => {
          if (row.progression_key) insertedIdsByProgressionKey.set(row.progression_key, row.id);
        });
        insertedStepCount += inserted.length;
      }

      const nextLevel: PendingStep[] = [];
      pendingLevel.forEach(({ step, path }) => {
        if (!step.children?.length) return;
        const rawProgressionKey = step.progression_key ?? `step_${path.replace(/\./g, '_')}`;
        const progressionKey = toImportedProgressionKey(family.familyKey, rawProgressionKey);
        const parentId = insertedIdsByProgressionKey.get(progressionKey);
        if (!parentId) throw new Error(`No se ha podido enlazar el paso de running "${rawProgressionKey}"`);
        step.children.forEach((child, childIndex) => {
          nextLevel.push({
            step: child,
            path: `${path}.${childIndex}`,
            orderIndex: childIndex,
            parentId,
          });
        });
      });
      pendingLevel = nextLevel;
    }
    logTrainingPlanImport('running-steps:created', {
      familyKey: family.familyKey,
      rows: insertedStepCount,
    });
    const progressions = buildProgressions(family, range.start);
    logTrainingPlanImport('running-progressions:replace', { templateId: template.id, rows: progressions.length });
    await replaceEnduranceStepProgressions(template.id, progressions);
    const templateProgressions = buildTemplateSummaryProgressions(template.id, family, range.start);
    if (templateProgressions.length > 0) {
      logTrainingPlanImport('running-template-progressions:create', {
        templateId: template.id,
        rows: templateProgressions.length,
      });
      const { error: templateProgressionError } = await supabase
        .from('endurance_workout_template_progressions')
        .insert(templateProgressions);
      if (templateProgressionError) {
        logTrainingPlanImportError('running-template-progressions:create-failed', templateProgressionError, {
          templateId: template.id,
          rows: templateProgressions.length,
        });
        throw templateProgressionError;
      }
    }
    const { error: finalizeError } = await supabase
      .from('endurance_workout_templates')
      .update({
        source: 'imported',
        scheduled_day: getImportedTemplateScheduledDay(family),
      })
      .eq('id', template.id)
      .eq('user_id', userId);
    if (!finalizeError) return { id: template.id, created: true };

    if (isUniqueViolation(finalizeError)) {
      await rollbackCreatedTemplate(userId, { family, id: template.id });
      const { data: winner, error: winnerError } = await supabase
        .from('endurance_workout_templates')
        .select('id')
        .eq('user_id', userId)
        .eq('source', 'imported')
        .eq('template_family_key', family.familyKey)
        .eq('recurrence_start_date', range.start)
        .eq('recurrence_end_date', range.end)
        .single();
      if (winnerError || !winner) throw winnerError ?? finalizeError;
      logTrainingPlanImport('running-template:concurrent-reuse', {
        familyKey: family.familyKey,
        templateId: winner.id,
      });
      return { id: winner.id, created: false };
    }
    throw finalizeError;
  } catch (creationError) {
    logTrainingPlanImportError('running-template:create-children-failed', creationError, {
      templateId: template.id,
      familyKey: family.familyKey,
    });
    await rollbackCreatedTemplate(userId, { family, id: template.id });
    throw creationError;
  }
};

const createStrengthTemplate = async (
  userId: string,
  family: ImportedTemplateFamily,
  range: { start: string; end: string },
  options: TrainingPlanImportOptions,
  resolvedByKey: Map<string, string>,
): Promise<TemplateCreationResult> => {
  const first = family.sessions[0];
  const baseExercises = first.exercises ?? [];
  logTrainingPlanImport('strength-template:create:start', {
    familyKey: family.familyKey,
    sessions: family.sessions.length,
    exercises: baseExercises.length,
  });
  const { data: template, error } = await supabase
    .from('workout_templates')
    .insert({
      user_id: userId,
      base_name: family.name,
      description: first.notes ?? null,
      workout_goal: family.workoutGoal,
      modality: family.modality,
      suggested_day_of_week: null,
      recurrence_start_date: range.start,
      recurrence_end_date: range.end,
      auto_delete_after_end: options.autoDeleteExpiredTemplates ?? true,
      template_family_key: family.familyKey,
      // Keep incomplete rows out of idempotent lookups during concurrent imports.
      source: 'importing',
    } as never)
    .select('id')
    .single();
  if (error || !template) {
    logTrainingPlanImportError(
      'strength-template:create:failed',
      error ?? new Error('No se ha creado la plantilla de fuerza'),
      {
        familyKey: family.familyKey,
      },
    );
    throw error ?? new Error('No se ha creado la plantilla de fuerza');
  }
  logTrainingPlanImport('strength-template:created', { familyKey: family.familyKey, templateId: template.id });
  try {
    const exerciseRows = baseExercises.map(exercise => {
      const exerciseId = resolvedByKey.get(getTrainingExerciseResolutionKey(exercise));
      if (!exerciseId) {
        const identifier = exercise.exercise_name ?? exercise.exercise_id ?? '';
        const error = new Error(`No se ha encontrado el ejercicio "${identifier}"`);
        logTrainingPlanImportError('strength-exercise:missing', error, {
          familyKey: family.familyKey,
          orderIndex: exercise.order_index,
          identifier,
        });
        throw error;
      }
      return {
        workout_template_id: template.id,
        exercise_id: exerciseId,
        order_index: exercise.order_index,
        is_warmup: exercise.is_warmup ?? false,
        target_sets: exercise.sets,
        target_reps_min: exercise.reps_min ?? exercise.reps ?? 8,
        target_reps_max: exercise.reps_max ?? exercise.reps ?? 8,
        target_weight_kg: exercise.weight_kg ?? null,
        target_rpe: exercise.rpe ?? null,
        target_rir_by_set: exercise.rir_by_set ?? null,
        rest_seconds: exercise.rest_seconds ?? null,
        notes: exercise.notes ?? null,
      };
    });
    const { data: insertedExercises, error: exercisesError } = await supabase
      .from('workout_template_exercises')
      .insert(exerciseRows)
      .select('id, exercise_id, order_index');
    if (exercisesError || !insertedExercises) {
      logTrainingPlanImportError(
        'strength-exercises:create:failed',
        exercisesError ?? new Error('No se han creado los ejercicios de fuerza'),
        { familyKey: family.familyKey, rows: exerciseRows.length },
      );
      throw exercisesError ?? new Error('No se han creado los ejercicios de fuerza');
    }
    logTrainingPlanImport('strength-exercises:created', {
      familyKey: family.familyKey,
      rows: insertedExercises.length,
    });
    const progressionRowsByExerciseAndWeek = new Map<
      string,
      {
        workout_template_id: string;
        workout_template_exercise_id: string;
        week_index: number;
        target_sets: number;
        target_reps_min: number | null;
        target_reps_max: number | null;
        target_weight_kg: number | null;
        target_rpe: number | null;
        target_rir_by_set: Array<number | null>;
        rest_seconds: number | null;
      }
    >();
    family.sessions.forEach(session => {
      const weekIndex = getProgressionWeekIndex(range.start, session.date);
      (session.exercises ?? []).forEach(exercise => {
        const inserted = insertedExercises.find(row => row.order_index === exercise.order_index);
        if (!inserted || weekIndex < 1) return;
        const progression = {
          workout_template_id: template.id,
          workout_template_exercise_id: inserted.id,
          week_index: weekIndex,
          target_sets: exercise.sets,
          target_reps_min: exercise.reps_min ?? exercise.reps ?? null,
          target_reps_max: exercise.reps_max ?? exercise.reps ?? null,
          target_weight_kg: exercise.weight_kg ?? null,
          target_rpe: exercise.rpe ?? null,
          target_rir_by_set: exercise.rir_by_set ?? Array<number | null>(exercise.sets).fill(null),
          rest_seconds: exercise.rest_seconds ?? null,
        };
        const progressionKey = `${inserted.id}:${weekIndex}`;
        const existing = progressionRowsByExerciseAndWeek.get(progressionKey);
        if (existing && JSON.stringify(existing) !== JSON.stringify(progression)) {
          throw new Error(
            `La familia "${family.familyKey}" contiene dos progresiones de fuerza distintas en la semana ${weekIndex}`,
          );
        }
        progressionRowsByExerciseAndWeek.set(progressionKey, progression);
      });
    });
    const progressionRows = [...progressionRowsByExerciseAndWeek.values()];
    if (progressionRows.length > 0) {
      logTrainingPlanImport('strength-progressions:create', {
        familyKey: family.familyKey,
        rows: progressionRows.length,
      });
      const { error: progressionError } = await supabase
        .from('workout_template_exercise_progressions')
        .insert(progressionRows);
      if (progressionError) {
        logTrainingPlanImportError('strength-progressions:create-failed', progressionError, {
          familyKey: family.familyKey,
          rows: progressionRows.length,
        });
        throw progressionError;
      }
    }
    const { error: finalizeError } = await supabase
      .from('workout_templates')
      .update({
        source: 'imported',
        suggested_day_of_week: getImportedTemplateScheduledDay(family),
      })
      .eq('id', template.id)
      .eq('user_id', userId);
    if (!finalizeError) return { id: template.id, created: true };

    if (isUniqueViolation(finalizeError)) {
      await rollbackCreatedTemplate(userId, { family, id: template.id });
      const { data: winner, error: winnerError } = await supabase
        .from('workout_templates')
        .select('id')
        .eq('user_id', userId)
        .eq('source', 'imported')
        .eq('template_family_key', family.familyKey)
        .eq('recurrence_start_date', range.start)
        .eq('recurrence_end_date', range.end)
        .single();
      if (winnerError || !winner) throw winnerError ?? finalizeError;
      logTrainingPlanImport('strength-template:concurrent-reuse', {
        familyKey: family.familyKey,
        templateId: winner.id,
      });
      return { id: winner.id, created: false };
    }
    throw finalizeError;
  } catch (creationError) {
    logTrainingPlanImportError('strength-template:create-children-failed', creationError, {
      templateId: template.id,
      familyKey: family.familyKey,
    });
    await rollbackCreatedTemplate(userId, { family, id: template.id });
    throw creationError;
  }
};

export const importTrainingPlan = async (
  userId: string,
  document: TrainingPlanImportDocument,
  options: TrainingPlanImportOptions = {},
): Promise<{ createdTemplateIds: string[]; createdPlanCount: number; reusedTemplateCount: number }> => {
  if (!userId) throw new Error('Authenticated user is required');
  const sessionCount = document.weeks.reduce((count, week) => count + week.sessions.length, 0);
  if (sessionCount < 1) throw new Error('At least one training session is required');
  logTrainingPlanImport('service:start', {
    planName: document.plan_name,
    weeks: document.weeks.length,
    sessions: sessionCount,
    startDate: document.start_date,
    endDate: document.end_date,
  });
  reportImportProgress(options, 'preparing', 4);
  const range = getDateRange(document);
  const families = groupTrainingPlanSessions(document);
  reportImportProgress(options, 'exercises', 10);
  const resolvedExercises = await resolveExercises(getStrengthExercises(document), options.exerciseResolutions);
  reportImportProgress(options, 'exercises', 25);
  await expireTrainingTemplates(userId);
  logTrainingPlanImport('families:grouped', {
    count: families.length,
    families: families.map(family => ({
      key: family.familyKey,
      sport: family.sport,
      sessions: family.sessions.length,
      scheduledDay: getImportedTemplateScheduledDay(family),
    })),
  });
  const created: CreatedTemplate[] = [];
  let reusedTemplateCount = 0;
  let existingRunningTemplates: ImportedTemplateCandidate[] = [];
  let existingStrengthTemplates: ImportedTemplateCandidate[] = [];
  const familyKeys = families.map(family => family.familyKey);
  if (familyKeys.length > 0) {
    const [existingRunning, existingStrength] = await Promise.all([
      supabase
        .from('endurance_workout_templates')
        .select('id, template_family_key, source, recurrence_start_date, recurrence_end_date')
        .eq('user_id', userId)
        .eq('source', 'imported')
        .eq('recurrence_start_date', range.start)
        .eq('recurrence_end_date', range.end),
      supabase
        .from('workout_templates')
        .select('id, template_family_key, source, recurrence_start_date, recurrence_end_date')
        .eq('user_id', userId)
        .eq('source', 'imported')
        .eq('recurrence_start_date', range.start)
        .eq('recurrence_end_date', range.end),
    ]);
    if (existingRunning.error) {
      logTrainingPlanImportError('templates:lookup:running-failed', existingRunning.error, { familyKeys });
      throw existingRunning.error;
    }
    if (existingStrength.error) {
      logTrainingPlanImportError('templates:lookup:strength-failed', existingStrength.error, { familyKeys });
      throw existingStrength.error;
    }
    logTrainingPlanImport('templates:lookup:complete', {
      requestedFamilies: familyKeys.length,
      runningMatches: existingRunning.data?.length ?? 0,
      strengthMatches: existingStrength.data?.length ?? 0,
    });
    existingRunningTemplates = existingRunning.data ?? [];
    existingStrengthTemplates = existingStrength.data ?? [];
  }
  reportImportProgress(options, 'templates', 35);
  try {
    const templateIdsByFamily = new Map<string, string>();
    for (const [familyIndex, family] of families.entries()) {
      const existingTemplate = findReusableImportedTemplate(
        family.sport === 'running' ? existingRunningTemplates : existingStrengthTemplates,
        family.familyKey,
        range,
      );
      logTrainingPlanImport('family:process', {
        familyKey: family.familyKey,
        sport: family.sport,
        sessions: family.sessions.length,
        scheduledDay: getImportedTemplateScheduledDay(family),
        mode: existingTemplate ? 'reuse' : 'create',
      });
      if (existingTemplate) {
        // A re-import of the exact same document is idempotent. Existing
        // template contents are never replaced implicitly from the import UI.
        templateIdsByFamily.set(family.familyKey, existingTemplate.id);
        reusedTemplateCount += 1;
      } else {
        const result =
          family.sport === 'running'
            ? await createEnduranceTemplate(userId, family, range, options)
            : await createStrengthTemplate(userId, family, range, options, resolvedExercises);
        if (result.created) created.push({ family, id: result.id });
        else reusedTemplateCount += 1;
        templateIdsByFamily.set(family.familyKey, result.id);
      }
      reportImportProgress(options, 'templates', 35 + ((familyIndex + 1) / families.length) * 55);
    }
    const requestedPlans = buildImportedWorkoutPlans(userId, families, templateIdsByFamily);
    logTrainingPlanImport('plans:upsert', {
      requested: requestedPlans.length,
    });
    reportImportProgress(options, 'calendar', 94);
    let createdPlanCount = 0;
    if (requestedPlans.length > 0) {
      const { data: insertedPlans, error } = await supabase
        .from('workout_plans')
        .upsert(requestedPlans, {
          onConflict: 'user_id,import_dedupe_key',
          ignoreDuplicates: true,
        })
        .select('id');
      if (error) {
        logTrainingPlanImportError('plans:create-failed', error, { rows: requestedPlans.length });
        throw error;
      }
      createdPlanCount = insertedPlans?.length ?? 0;
      logTrainingPlanImport('plans:created', { rows: createdPlanCount });
    }
    logTrainingPlanImport('service:complete', {
      createdTemplates: created.length,
      reusedTemplates: reusedTemplateCount,
      createdPlans: createdPlanCount,
    });
    reportImportProgress(options, 'complete', 100);
    return {
      createdTemplateIds: created.map(item => item.id),
      createdPlanCount,
      reusedTemplateCount,
    };
  } catch (error) {
    logTrainingPlanImportError('service:failed', error, { createdTemplates: created.length });
    // Fully built templates stay available so a retry can resume safely. Only
    // incomplete `source = importing` templates are rolled back inside their
    // creation functions; deleting finalized rows here could race another
    // device that already reused them.
    throw error;
  }
};
