import { supabase } from '../../../lib/supabaseClient';
import { startOfWeek, addWeeks, getISOWeek, getYear, format, addDays } from 'date-fns';
import { WorkoutPlanInsert } from '../../../types/requests.types';
import { RecurringEnduranceTemplate } from './enduranceProgressionService';
import { expireTrainingTemplates } from './templateLifecycleService';
import { getTrainingHorizonWeek } from './trainingCalendarRange';
import { isDateWithinTemplateRecurrence, shouldAutoPropagateTemplate } from '../helpers/trainingPropagation.helper';

/**
 * Get ISO week string in format "YYYY-WXX"
 */
export const getISOWeekString = (date: Date): string => {
  const year = getYear(date);
  const week = getISOWeek(date);
  return `${year}-W${week.toString().padStart(2, '0')}`;
};

/**
 * Helper to converting YYYY-WXX to Date (Monday of that week)
 */
const getDateFromISOWeekString = (isoStr: string): Date => {
  const [yearStr, weekStr] = isoStr.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);

  // Simple algo: Jan 4th is always in week 1
  const d = new Date(year, 0, 4);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7; // 1=Mon, 7=Sun
  // Move to start of Week 1
  const startWeek1 = new Date(d.getTime() - (day - 1) * 24 * 60 * 60 * 1000);

  // Add (week - 1) weeks
  return addWeeks(startWeek1, week - 1);
};

const getPlannedDateForWeekday = (weekStart: Date, dayOfWeek: number): Date => {
  const daysOffset = (dayOfWeek + 6) % 7;
  return addDays(weekStart, daysOffset);
};

/**
 * Main function to check and plan new weeks
 */
export const checkAndPlanNewWeeks = async (
  userId: string,
  lastPlannedWeek: string | undefined, // stored in nutrition_prefs for now
  options: { skipTemplateExpiration?: boolean } = {},
): Promise<{ planned: boolean; newLastPlannedWeek: string; createdCount: number }> => {
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│ [trainingPlanService] 🏋️ VERIFICANDO PLANES    │');
  console.log('└─────────────────────────────────────────────────┘');

  if (!options.skipTemplateExpiration) {
    await expireTrainingTemplates(userId, format(new Date(), 'yyyy-MM-dd'));
  }

  const horizonDate = getTrainingHorizonWeek();
  const horizonISO = getISOWeekString(horizonDate);

  console.log(`[trainingPlanService] Última planificada: ${lastPlannedWeek || 'ninguna'}`);
  console.log(`[trainingPlanService] Horizonte actual: ${horizonISO}`);

  // Determine start week for checking
  let startCheckDate: Date;
  if (!lastPlannedWeek) {
    // If never run, start from THIS week? Or next week?
    // Let's safe-start from CURRENT week.
    // We already have duplicate checks, so overlapping is fine.
    startCheckDate = startOfWeek(new Date(), { weekStartsOn: 1 });
  } else {
    // Start from the week AFTER the last successful one
    const lastDate = getDateFromISOWeekString(lastPlannedWeek);
    startCheckDate = addWeeks(lastDate, 1);
  }

  // Safety: If startCheck is beyond horizon, do nothing
  if (startCheckDate.getTime() > horizonDate.getTime() + 1000) {
    console.log('[trainingPlanService] ✓ Todo al día.');
    return { planned: false, newLastPlannedWeek: horizonISO, createdCount: 0 };
  }

  // We need to fetch recurring templates ONCE
  // 1. Gym Templates
  const { data: gymTemplates, error: gymError } = await supabase
    .from('workout_templates')
    .select('id, base_name, suggested_day_of_week, recurrence_start_date, recurrence_end_date, source')
    .eq('user_id', userId)
    .not('suggested_day_of_week', 'is', null);

  if (gymError) {
    console.error('[trainingPlanService] Error fetching gym templates:', gymError);
    return { planned: false, newLastPlannedWeek: lastPlannedWeek || '', createdCount: 0 };
  }

  // 2. Endurance Templates
  const { data: enduranceTemplates, error: cardioError } = await supabase
    .from('endurance_workout_templates')
    .select('id, base_name, scheduled_day, recurrence_start_date, recurrence_end_date, source')
    .eq('user_id', userId)
    .not('scheduled_day', 'is', null)
    .returns<Array<RecurringEnduranceTemplate & { base_name: string; source: string | null }>>();

  if (cardioError) {
    console.error('[trainingPlanService] Error fetching endurance templates:', cardioError);
    return { planned: false, newLastPlannedWeek: lastPlannedWeek || '', createdCount: 0 };
  }

  const allRecurringGym = (gymTemplates || []).filter(shouldAutoPropagateTemplate);
  const allRecurringEndurance = (enduranceTemplates || []).filter(shouldAutoPropagateTemplate);
  console.log(
    `[trainingPlanService] Plantillas recurrentes encontradas: Gym=${allRecurringGym.length}, Cardio=${allRecurringEndurance.length}`,
  );

  if (allRecurringGym.length === 0 && allRecurringEndurance.length === 0) {
    console.log('[trainingPlanService] Sin plantillas recurrentes. Actualizando puntero.');
    return { planned: false, newLastPlannedWeek: horizonISO, createdCount: 0 };
  }

  let totalCreated = 0;
  let currentWeek = startCheckDate;
  const safetyLimit = 10; // Max 10 weeks processing at once
  let loops = 0;

  // Iterate week by week
  while (currentWeek.getTime() <= horizonDate.getTime() && loops < safetyLimit) {
    const weekISO = getISOWeekString(currentWeek);
    console.log(`[trainingPlanService] 👉 Procesando semana: ${weekISO}`);

    // Process Gym Templates
    for (const tpl of allRecurringGym) {
      if (tpl.suggested_day_of_week === null) continue;
      const targetDateStr = format(getPlannedDateForWeekday(currentWeek, tpl.suggested_day_of_week), 'yyyy-MM-dd');
      if (!isDateWithinTemplateRecurrence(targetDateStr, tpl)) continue;
      const created = await ensurePlanExists(userId, currentWeek, tpl.suggested_day_of_week, 'gym', tpl.id);
      if (created) totalCreated++;
    }

    // Process Endurance Templates
    for (const tpl of allRecurringEndurance) {
      if (tpl.scheduled_day === null) continue;
      const targetDateStr = format(getPlannedDateForWeekday(currentWeek, tpl.scheduled_day), 'yyyy-MM-dd');
      if (!isDateWithinTemplateRecurrence(targetDateStr, tpl)) continue;
      const created = await ensurePlanExists(userId, currentWeek, tpl.scheduled_day, 'endurance', tpl.id);
      if (created) totalCreated++;
    }

    currentWeek = addWeeks(currentWeek, 1);
    loops++;
  }

  return { planned: true, newLastPlannedWeek: horizonISO, createdCount: totalCreated };
};

/**
 * Helper to insert plan if not exists (Duplicate Prevention)
 */
const ensurePlanExists = async (
  userId: string,
  weekStart: Date,
  dayOfWeek: number, // 0-6
  type: 'gym' | 'endurance',
  templateId: string,
) => {
  // Calculate target date
  // weekStart is Monday (from date-fns startOfWeek with weekStartsOn: 1)
  // But dayOfWeek is 0 (Sun) to 6 (Sat)
  // If weekStart is Monday (Day 1), and we want Day 1 (Monday), it's +0 days.
  // If we want Day 3 (Wednesday), it's +2 days.
  // If we want Day 0 (Sunday), it's +6 days (since Sunday is the LAST day of ISO week for our logic usually).
  // Wait, date-fns `startOfWeek({ weekStartsOn: 1 })` returns Monday.
  // `getDay()` returns 0 for Sunday.
  // So Monday=1, Sunday=0.
  // Target Date = Monday + ((TargetDay + 6) % 7) ? No, simpler:
  // Offset from Monday:
  // Mon(1) -> 0 offset
  // Tue(2) -> 1
  // ...
  // Sun(0) -> 6 offset

  // (dayOfWeek + 6) % 7 should give:
  // If day=1 (Mon) -> (1+6)%7 = 7%7 = 0. Correct.
  // If day=0 (Sun) -> (0+6)%7 = 6. Correct.
  // If day=3 (Wed) -> (3+6)%7 = 9%7 = 2. Correct.
  const targetDate = getPlannedDateForWeekday(weekStart, dayOfWeek);
  const targetDateStr = format(targetDate, 'yyyy-MM-dd');

  // Double Check Existence
  let query = supabase.from('workout_plans').select('id').eq('user_id', userId).eq('planned_date', targetDateStr);

  if (type === 'gym') {
    query = query.eq('gym_template_id', templateId);
  } else {
    query = query.eq('endurance_template_id', templateId);
  }

  const { data: existing } = await query;

  if (existing && existing.length > 0) {
    // console.log(`[trainingPlanService]   - Skip duplicado: ${targetDateStr} (${type} ${templateId})`);
    return false;
  }

  // Insert
  // console.log(`[trainingPlanService]   + Creando plan: ${targetDateStr} (${type})`);
  const insertPayload: WorkoutPlanInsert = {
    user_id: userId,
    planned_date: targetDateStr,
    status: 'planned',
  };

  if (type === 'gym') insertPayload.gym_template_id = templateId;
  else insertPayload.endurance_template_id = templateId;

  const { error } = await supabase.from('workout_plans').insert(insertPayload);

  if (error) {
    console.error(`[trainingPlanService] Error insertando plan ${targetDateStr}:`, error);
    return false;
  }

  return true;
};
