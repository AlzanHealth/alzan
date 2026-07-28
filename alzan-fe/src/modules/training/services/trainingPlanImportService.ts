import { differenceInCalendarWeeks, parseISO } from 'date-fns';
import { supabase } from '../../../lib/supabaseClient';
import type { WorkoutPlanInsert } from '../../../types/requests.types';
import type { StepProgressionOverride } from '../helpers/enduranceProgression.helper';
import { replaceEnduranceStepProgressions } from './enduranceProgressionService';
import { expireTrainingTemplates } from './templateLifecycleService';
import { groupTrainingPlanSessions, ImportedTemplateFamily } from './trainingPlanImportPlanner';
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
        progression_key: key,
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
  const { data, error } = await supabase.from('exercises').select('id, base_name_es, base_name_en');
  if (error) throw error;
  const byName = new Map(
    (data ?? []).flatMap(exercise =>
      [exercise.base_name_es, exercise.base_name_en]
        .filter((name): name is string => Boolean(name))
        .map(name => [normalizeName(name), exercise.id] as const),
    ),
  );
  const resolved = new Map<string, string>();
  for (const exercise of exercises) {
    const id =
      exercise.exercise_id ?? (exercise.exercise_name ? byName.get(normalizeName(exercise.exercise_name)) : undefined);
    if (!id)
      throw new Error(`No se ha encontrado el ejercicio "${exercise.exercise_name ?? exercise.exercise_id ?? ''}"`);
    resolved.set(`${exercise.order_index}:${normalizeName(exercise.exercise_name ?? id)}`, id);
  }
  return resolved;
};

const createEnduranceTemplate = async (
  userId: string,
  family: ImportedTemplateFamily,
  range: { start: string; end: string | null },
  options: TrainingPlanImportOptions,
) => {
  const first = family.sessions[0];
  const { data: template, error } = await supabase
    .from('endurance_workout_templates')
    .insert({
      user_id: userId,
      sport_type: 'running',
      base_name: family.name,
      description: first.notes ?? null,
      workout_goal: family.workoutGoal,
      // Imported plans already contain their exact dates. Leaving the
      // weekday unset prevents the recurring-plan propagator from inventing
      // workouts outside the JSON document.
      scheduled_day: null,
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
  if (error || !template) throw error ?? new Error('No se ha creado la plantilla de running');
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
      const progressionKey = step.progression_key ?? `step_${path.replace(/\./g, '_')}`;
      const { data: inserted, error: stepError } = await supabase
        .from('endurance_workout_steps')
        .insert(toRunningStepRow(step, template.id, orderIndex, parentId, progressionKey))
        .select('id')
        .single();
      if (stepError || !inserted) throw stepError ?? new Error('No se ha creado un paso de running');
      if (step.children?.length) await insertSteps(step.children, inserted.id, 0, path);
      orderIndex += 1;
    }
  };
  await insertSteps(firstSteps);
  await replaceEnduranceStepProgressions(template.id, buildProgressions(family, range.start));
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
  const resolvedByKey = await resolveExercises(family.sessions.flatMap(session => session.exercises ?? []));
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
      source: 'imported',
    } as never)
    .select('id')
    .single();
  if (error || !template) throw error ?? new Error('No se ha creado la plantilla de fuerza');
  const exerciseRows = baseExercises.map(exercise => {
    const exerciseId = resolvedByKey.get(
      `${exercise.order_index}:${normalizeName(exercise.exercise_name ?? exercise.exercise_id ?? '')}`,
    );
    if (!exerciseId) {
      throw new Error(`No se ha encontrado el ejercicio "${exercise.exercise_name ?? exercise.exercise_id ?? ''}"`);
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
  if (exercisesError || !insertedExercises)
    throw exercisesError ?? new Error('No se han creado los ejercicios de fuerza');
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
    const { error: progressionError } = await supabase
      .from('workout_template_exercise_progressions')
      .insert(progressionRows as never);
    if (progressionError) throw progressionError;
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
  const { error } = await supabase
    .from('endurance_workout_templates')
    .update({
      recurrence_start_date: range.start,
      recurrence_end_date: range.end,
      auto_delete_after_end: options.autoDeleteExpiredTemplates ?? true,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', templateId)
    .eq('user_id', userId);
  if (error) throw error;
  await replaceEnduranceStepProgressions(templateId, buildProgressions(family, range.start));
};

const refreshExistingStrengthTemplate = async (
  userId: string,
  family: ImportedTemplateFamily,
  templateId: string,
  range: { start: string; end: string | null },
  options: TrainingPlanImportOptions,
): Promise<void> => {
  const { error: templateError } = await supabase
    .from('workout_templates')
    .update({
      recurrence_start_date: range.start,
      recurrence_end_date: range.end,
      auto_delete_after_end: options.autoDeleteExpiredTemplates ?? true,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', templateId)
    .eq('user_id', userId);
  if (templateError) throw templateError;
  const { data: existingExercises, error: exercisesError } = await supabase
    .from('workout_template_exercises')
    .select('id, order_index')
    .eq('workout_template_id', templateId);
  if (exercisesError) throw exercisesError;
  const { error: deleteError } = await supabase
    .from('workout_template_exercise_progressions')
    .delete()
    .eq('workout_template_id', templateId);
  if (deleteError) throw deleteError;
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
    if (progressionError) throw progressionError;
  }
};

export const importTrainingPlan = async (
  userId: string,
  document: TrainingPlanImportDocument,
  options: TrainingPlanImportOptions = {},
): Promise<{ createdTemplateIds: string[]; createdPlanCount: number }> => {
  if (!userId) throw new Error('Authenticated user is required');
  await expireTrainingTemplates(userId);
  const range = getDateRange(document);
  const families = groupTrainingPlanSessions(document);
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
    if (existingRunning.error) throw existingRunning.error;
    if (existingStrength.error) throw existingStrength.error;
    for (const template of [...(existingRunning.data ?? []), ...(existingStrength.data ?? [])]) {
      if (template.template_family_key) existingTemplateIds.set(template.template_family_key, template.id);
    }
  }
  try {
    const templateIdsByFamily = new Map<string, string>();
    for (const family of families) {
      const existingId = existingTemplateIds.get(family.familyKey);
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
    if (existingPlansError) throw existingPlansError;
    const existingPlanKeys = new Set(
      (existingPlans ?? []).map(plan => `${plan.planned_date}:${plan.gym_template_id ?? plan.endurance_template_id}`),
    );
    const plans = requestedPlans.filter(plan => {
      const templateId = plan.gym_template_id ?? plan.endurance_template_id;
      return templateId ? !existingPlanKeys.has(`${plan.planned_date}:${templateId}`) : false;
    });
    if (plans.length > 0) {
      const { error } = await supabase.from('workout_plans').insert(plans);
      if (error) throw error;
    }
    return { createdTemplateIds: created.map(item => item.id), createdPlanCount: plans.length };
  } catch (error) {
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
    }
    throw error;
  }
};
