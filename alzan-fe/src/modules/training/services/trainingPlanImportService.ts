import { differenceInCalendarWeeks, parseISO } from 'date-fns';
import { supabase } from '../../../lib/supabaseClient';
import type { WorkoutPlanInsert } from '../../../types/requests.types';
import type { StepProgressionOverride } from '../helpers/enduranceProgression.helper';
import { replaceEnduranceStepProgressions } from './enduranceProgressionService';
import { expireTrainingTemplates } from './templateLifecycleService';
import {
  getImportedTemplateScheduledDay,
  groupTrainingPlanSessions,
  ImportedTemplateFamily,
} from './trainingPlanImportPlanner';
import { logTrainingPlanImport, logTrainingPlanImportError } from './trainingPlanImportLogger';
import { toImportedProgressionKey } from './trainingPlanImportProgressionKey';
import type {
  TrainingPlanImportDocument,
  TrainingPlanRunningStep,
  TrainingPlanStrengthExercise,
} from './trainingPlanImportContract';

type CreatedTemplate = { family: ImportedTemplateFamily; id: string };
type TrainingPlanImportOptions = { autoDeleteExpiredTemplates?: boolean };

const normalizeName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const getDateRange = (document: TrainingPlanImportDocument): { start: string; end: string | null } => {
  return {
    start: document.start_date,
    end: document.end_date ?? null,
  };
};

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
  const overrides: StepProgressionOverride[] = [];
  for (const session of family.sessions) {
    if (session.sport !== 'running' || !session.running_steps) continue;
    const weekIndex = differenceInCalendarWeeks(parseISO(session.date), parseISO(startDate), { weekStartsOn: 1 }) + 1;
    if (weekIndex < 1) continue;
    for (const { step, key } of flattenSteps(session.running_steps)) {
      overrides.push({
        progression_key: toImportedProgressionKey(family.familyKey, key),
        week_index: weekIndex,
        duration_s: step.duration_s,
        distance_m: step.distance_m,
        target_type: step.target_type,
        target_min: step.target_min,
        target_max: step.target_max,
        repetitions: step.repetitions,
      });
    }
  }
  return overrides;
};

const resolveExercises = async (exercises: TrainingPlanStrengthExercise[]): Promise<Map<string, string>> => {
  logTrainingPlanImport('resolve-exercises:start', { requested: exercises.length });
  const catalog: Array<{ id: string; base_name_es: string | null; base_name_en: string | null }> = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, base_name_es, base_name_en')
      .range(offset, offset + pageSize - 1);
    if (error) {
      logTrainingPlanImportError('resolve-exercises:query-failed', error, { offset, pageSize });
      throw error;
    }
    catalog.push(...(data ?? []));
    logTrainingPlanImport('resolve-exercises:page-loaded', {
      offset,
      rows: data?.length ?? 0,
    });
    if (!data || data.length < pageSize) break;
  }
  logTrainingPlanImport('resolve-exercises:catalog-loaded', { catalogSize: catalog.length });
  const knownIds = new Set(catalog.map(exercise => exercise.id));
  const byName = new Map(
    catalog.flatMap(exercise =>
      [exercise.base_name_es, exercise.base_name_en]
        .filter((name): name is string => Boolean(name))
        .map(name => [normalizeName(name), exercise.id] as const),
    ),
  );
  const resolved = new Map<string, string>();
  for (const exercise of exercises) {
    const explicitId = exercise.exercise_id;
    const id = explicitId ?? (exercise.exercise_name ? byName.get(normalizeName(exercise.exercise_name)) : undefined);
    if (explicitId && !knownIds.has(explicitId)) {
      const error = new Error(`No se ha encontrado el ejercicio "${explicitId}"`);
      logTrainingPlanImportError('resolve-exercises:missing-id', error, {
        orderIndex: exercise.order_index,
        identifier: explicitId,
      });
      throw error;
    }
    if (!id) {
      const identifier = exercise.exercise_name ?? exercise.exercise_id ?? '';
      const error = new Error(`No se ha encontrado el ejercicio "${identifier}"`);
      logTrainingPlanImportError('resolve-exercises:missing', error, {
        orderIndex: exercise.order_index,
        identifier,
      });
      throw error;
    }
    logTrainingPlanImport('resolve-exercises:matched', {
      orderIndex: exercise.order_index,
      source: exercise.exercise_id ? 'id' : 'name',
    });
    resolved.set(`${exercise.order_index}:${normalizeName(exercise.exercise_name ?? id)}`, id);
  }
  logTrainingPlanImport('resolve-exercises:complete', { resolved: resolved.size });
  return resolved;
};

const createEnduranceTemplate = async (
  userId: string,
  family: ImportedTemplateFamily,
  range: { start: string; end: string | null },
  options: TrainingPlanImportOptions,
) => {
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
      // A single weekday can be represented by the recurring template and
      // keeps the weekday selected in the editor. Mixed-weekday families stay
      // date-driven so propagation cannot invent sessions.
      scheduled_day: getImportedTemplateScheduledDay(family),
      recurrence_start_date: range.start,
      recurrence_end_date: range.end,
      auto_delete_after_end: options.autoDeleteExpiredTemplates ?? true,
      template_family_key: family.familyKey,
      source: 'imported',
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
  const firstSteps = first.running_steps ?? [];
  const insertSteps = async (
    steps: TrainingPlanRunningStep[],
    parentId: string | null = null,
    orderStart = 0,
    pathPrefix = '',
  ): Promise<void> => {
    let orderIndex = orderStart;
    for (const [index, step] of steps.entries()) {
      const path = pathPrefix ? `${pathPrefix}.${index}` : `${index}`;
      const rawProgressionKey = step.progression_key ?? `step_${path.replace(/\./g, '_')}`;
      const progressionKey = toImportedProgressionKey(family.familyKey, rawProgressionKey);
      const { data: inserted, error: stepError } = await supabase
        .from('endurance_workout_steps')
        .insert(toRunningStepRow(step, template.id, orderIndex, parentId, progressionKey))
        .select('id')
        .single();
      if (stepError || !inserted) {
        logTrainingPlanImportError(
          'running-step:create:failed',
          stepError ?? new Error('No se ha creado un paso de running'),
          {
            familyKey: family.familyKey,
            orderIndex,
            phaseType: step.phase_type,
          },
        );
        throw stepError ?? new Error('No se ha creado un paso de running');
      }
      logTrainingPlanImport('running-step:created', {
        familyKey: family.familyKey,
        orderIndex,
        phaseType: step.phase_type,
      });
      if (step.children?.length) await insertSteps(step.children, inserted.id, 0, path);
      orderIndex += 1;
    }
  };
  await insertSteps(firstSteps);
  const progressions = buildProgressions(family, range.start);
  logTrainingPlanImport('running-progressions:replace', { templateId: template.id, rows: progressions.length });
  try {
    await replaceEnduranceStepProgressions(template.id, progressions);
  } catch (progressionError) {
    logTrainingPlanImportError('running-progressions:replace-failed', progressionError, {
      templateId: template.id,
      rows: progressions.length,
    });
    throw progressionError;
  }
  return template.id;
};

const createStrengthTemplate = async (
  userId: string,
  family: ImportedTemplateFamily,
  range: { start: string; end: string | null },
  options: TrainingPlanImportOptions,
) => {
  const first = family.sessions[0];
  const baseExercises = first.exercises ?? [];
  logTrainingPlanImport('strength-template:create:start', {
    familyKey: family.familyKey,
    sessions: family.sessions.length,
    exercises: baseExercises.length,
  });
  const resolvedByKey = await resolveExercises(family.sessions.flatMap(session => session.exercises ?? []));
  const { data: template, error } = await supabase
    .from('workout_templates')
    .insert({
      user_id: userId,
      base_name: family.name,
      description: first.notes ?? null,
      workout_goal: family.workoutGoal,
      modality: family.modality,
      suggested_day_of_week: getImportedTemplateScheduledDay(family),
      recurrence_start_date: range.start,
      recurrence_end_date: range.end,
      auto_delete_after_end: options.autoDeleteExpiredTemplates ?? true,
      template_family_key: family.familyKey,
      source: 'imported',
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
  const exerciseRows = baseExercises.map(exercise => {
    const exerciseId = resolvedByKey.get(
      `${exercise.order_index}:${normalizeName(exercise.exercise_name ?? exercise.exercise_id ?? '')}`,
    );
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
  const progressionRows = family.sessions.flatMap(session => {
    const weekIndex = differenceInCalendarWeeks(parseISO(session.date), parseISO(range.start), { weekStartsOn: 1 }) + 1;
    return (session.exercises ?? []).flatMap(exercise => {
      const inserted = insertedExercises.find(row => row.order_index === exercise.order_index);
      if (!inserted || weekIndex < 1) return [];
      return [
        {
          workout_template_id: template.id,
          workout_template_exercise_id: inserted.id,
          week_index: weekIndex,
          target_sets: exercise.sets,
          target_reps_min: exercise.reps_min ?? exercise.reps ?? null,
          target_reps_max: exercise.reps_max ?? exercise.reps ?? null,
          target_weight_kg: exercise.weight_kg ?? null,
          target_rpe: exercise.rpe ?? null,
          rest_seconds: exercise.rest_seconds ?? null,
        },
      ];
    });
  });
  if (progressionRows.length > 0) {
    logTrainingPlanImport('strength-progressions:create', {
      familyKey: family.familyKey,
      rows: progressionRows.length,
    });
    const { error: progressionError } = await supabase
      .from('workout_template_exercise_progressions')
      .insert(progressionRows as never);
    if (progressionError) {
      logTrainingPlanImportError('strength-progressions:create-failed', progressionError, {
        familyKey: family.familyKey,
        rows: progressionRows.length,
      });
      throw progressionError;
    }
  }
  return template.id;
};

const refreshExistingEnduranceTemplate = async (
  userId: string,
  family: ImportedTemplateFamily,
  templateId: string,
  range: { start: string; end: string | null },
  options: TrainingPlanImportOptions,
): Promise<void> => {
  logTrainingPlanImport('running-template:refresh:start', { templateId, familyKey: family.familyKey });
  const { error } = await supabase
    .from('endurance_workout_templates')
    .update({
      scheduled_day: getImportedTemplateScheduledDay(family),
      recurrence_start_date: range.start,
      recurrence_end_date: range.end,
      auto_delete_after_end: options.autoDeleteExpiredTemplates ?? true,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', templateId)
    .eq('user_id', userId);
  if (error) {
    logTrainingPlanImportError('running-template:refresh:failed', error, { templateId, familyKey: family.familyKey });
    throw error;
  }
  const progressions = buildProgressions(family, range.start);
  logTrainingPlanImport('running-template:refresh:progressions', { templateId, rows: progressions.length });
  try {
    await replaceEnduranceStepProgressions(templateId, progressions);
  } catch (progressionError) {
    logTrainingPlanImportError('running-template:refresh:progressions-failed', progressionError, { templateId });
    throw progressionError;
  }
  logTrainingPlanImport('running-template:refresh:complete', { templateId });
};

const refreshExistingStrengthTemplate = async (
  userId: string,
  family: ImportedTemplateFamily,
  templateId: string,
  range: { start: string; end: string | null },
  options: TrainingPlanImportOptions,
): Promise<void> => {
  logTrainingPlanImport('strength-template:refresh:start', { templateId, familyKey: family.familyKey });
  const { error: templateError } = await supabase
    .from('workout_templates')
    .update({
      suggested_day_of_week: getImportedTemplateScheduledDay(family),
      recurrence_start_date: range.start,
      recurrence_end_date: range.end,
      auto_delete_after_end: options.autoDeleteExpiredTemplates ?? true,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', templateId)
    .eq('user_id', userId);
  if (templateError) {
    logTrainingPlanImportError('strength-template:refresh:failed', templateError, {
      templateId,
      familyKey: family.familyKey,
    });
    throw templateError;
  }
  const { data: existingExercises, error: exercisesError } = await supabase
    .from('workout_template_exercises')
    .select('id, order_index')
    .eq('workout_template_id', templateId);
  if (exercisesError) {
    logTrainingPlanImportError('strength-template:refresh:exercises-query-failed', exercisesError, { templateId });
    throw exercisesError;
  }
  const { error: deleteError } = await supabase
    .from('workout_template_exercise_progressions')
    .delete()
    .eq('workout_template_id', templateId);
  if (deleteError) {
    logTrainingPlanImportError('strength-template:refresh:progressions-delete-failed', deleteError, { templateId });
    throw deleteError;
  }
  const progressionRows = family.sessions.flatMap(session => {
    const weekIndex = differenceInCalendarWeeks(parseISO(session.date), parseISO(range.start), { weekStartsOn: 1 }) + 1;
    return (session.exercises ?? []).flatMap(exercise => {
      const existing = existingExercises?.find(row => row.order_index === exercise.order_index);
      if (!existing || weekIndex < 1) return [];
      return [
        {
          workout_template_id: templateId,
          workout_template_exercise_id: existing.id,
          week_index: weekIndex,
          target_sets: exercise.sets,
          target_reps_min: exercise.reps_min ?? exercise.reps ?? null,
          target_reps_max: exercise.reps_max ?? exercise.reps ?? null,
          target_weight_kg: exercise.weight_kg ?? null,
          target_rpe: exercise.rpe ?? null,
          rest_seconds: exercise.rest_seconds ?? null,
        },
      ];
    });
  });
  if (progressionRows.length > 0) {
    const { error: progressionError } = await supabase
      .from('workout_template_exercise_progressions')
      .insert(progressionRows as never);
    if (progressionError) {
      logTrainingPlanImportError('strength-template:refresh:progressions-failed', progressionError, {
        templateId,
        rows: progressionRows.length,
      });
      throw progressionError;
    }
  }
  logTrainingPlanImport('strength-template:refresh:complete', { templateId, rows: progressionRows.length });
};

export const importTrainingPlan = async (
  userId: string,
  document: TrainingPlanImportDocument,
  options: TrainingPlanImportOptions = {},
): Promise<{ createdTemplateIds: string[]; createdPlanCount: number }> => {
  if (!userId) throw new Error('Authenticated user is required');
  const sessionCount = document.weeks.reduce((count, week) => count + week.sessions.length, 0);
  logTrainingPlanImport('service:start', {
    planName: document.plan_name,
    weeks: document.weeks.length,
    sessions: sessionCount,
    startDate: document.start_date,
    endDate: document.end_date ?? null,
  });
  await expireTrainingTemplates(userId);
  const range = getDateRange(document);
  const families = groupTrainingPlanSessions(document);
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
  const existingTemplateIds = new Map<string, string>();
  const familyKeys = families.map(family => family.familyKey);
  if (familyKeys.length > 0) {
    const [existingRunning, existingStrength] = await Promise.all([
      supabase
        .from('endurance_workout_templates')
        .select('id, template_family_key')
        .eq('user_id', userId)
        .in('template_family_key', familyKeys),
      supabase
        .from('workout_templates')
        .select('id, template_family_key')
        .eq('user_id', userId)
        .in('template_family_key', familyKeys),
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
    for (const template of [...(existingRunning.data ?? []), ...(existingStrength.data ?? [])]) {
      if (template.template_family_key) existingTemplateIds.set(template.template_family_key, template.id);
    }
  }
  try {
    const templateIdsByFamily = new Map<string, string>();
    for (const family of families) {
      const existingId = existingTemplateIds.get(family.familyKey);
      logTrainingPlanImport('family:process', {
        familyKey: family.familyKey,
        sport: family.sport,
        sessions: family.sessions.length,
        scheduledDay: getImportedTemplateScheduledDay(family),
        mode: existingId ? 'refresh' : 'create',
      });
      if (existingId) {
        if (family.sport === 'running') {
          await refreshExistingEnduranceTemplate(userId, family, existingId, range, options);
        } else {
          await refreshExistingStrengthTemplate(userId, family, existingId, range, options);
        }
        templateIdsByFamily.set(family.familyKey, existingId);
      } else {
        const id =
          family.sport === 'running'
            ? await createEnduranceTemplate(userId, family, range, options)
            : await createStrengthTemplate(userId, family, range, options);
        created.push({ family, id });
        templateIdsByFamily.set(family.familyKey, id);
      }
    }
    const requestedPlans: WorkoutPlanInsert[] = families.flatMap(family =>
      family.sessions.map(session => ({
        user_id: userId,
        planned_date: session.date,
        status: 'planned',
        notes: session.notes ?? null,
        ...(family.sport === 'running'
          ? { endurance_template_id: templateIdsByFamily.get(family.familyKey) }
          : { gym_template_id: templateIdsByFamily.get(family.familyKey) }),
      })),
    );
    const templateIds = [...templateIdsByFamily.values()];
    const dates = [...new Set(requestedPlans.map(plan => plan.planned_date))];
    const { data: existingPlans, error: existingPlansError } = await supabase
      .from('workout_plans')
      .select('planned_date, gym_template_id, endurance_template_id')
      .eq('user_id', userId)
      .in('planned_date', dates)
      .or(`gym_template_id.in.(${templateIds.join(',')}),endurance_template_id.in.(${templateIds.join(',')})`);
    if (existingPlansError) {
      logTrainingPlanImportError('plans:lookup:failed', existingPlansError, { dates, templateIds });
      throw existingPlansError;
    }
    const existingPlanKeys = new Set(
      (existingPlans ?? []).map(plan => `${plan.planned_date}:${plan.gym_template_id ?? plan.endurance_template_id}`),
    );
    const plans = requestedPlans.filter(plan => {
      const templateId = plan.gym_template_id ?? plan.endurance_template_id;
      return templateId ? !existingPlanKeys.has(`${plan.planned_date}:${templateId}`) : false;
    });
    logTrainingPlanImport('plans:deduplicated', {
      requested: requestedPlans.length,
      existing: existingPlans?.length ?? 0,
      toInsert: plans.length,
    });
    if (plans.length > 0) {
      const { error } = await supabase.from('workout_plans').insert(plans);
      if (error) {
        logTrainingPlanImportError('plans:create:failed', error, { rows: plans.length });
        throw error;
      }
      logTrainingPlanImport('plans:created', { rows: plans.length });
    }
    logTrainingPlanImport('service:complete', {
      createdTemplates: created.length,
      createdPlans: plans.length,
    });
    return { createdTemplateIds: created.map(item => item.id), createdPlanCount: plans.length };
  } catch (error) {
    logTrainingPlanImportError('service:failed', error, { createdTemplates: created.length });
    // Roll back only templates created by this import. Existing templates and
    // completed history are never targeted here.
    for (const item of created) {
      await supabase
        .from('workout_plans')
        .delete()
        .eq('user_id', userId)
        .eq(item.family.sport === 'running' ? 'endurance_template_id' : 'gym_template_id', item.id)
        .is('completed_at', null);
      await supabase
        .from(item.family.sport === 'running' ? 'endurance_workout_templates' : 'workout_templates')
        .delete()
        .eq('id', item.id)
        .eq('user_id', userId);
      logTrainingPlanImport('rollback:template-removed', { templateId: item.id, sport: item.family.sport });
    }
    throw error;
  }
};
