import { supabase } from '../../../lib/supabaseClient';
import { addDays, format, startOfWeek, getDay } from 'date-fns';
import { WorkoutPlanInsert } from '../../../types/requests.types';
import { expireTrainingTemplates } from './templateLifecycleService';
import { isDateWithinTemplateRecurrence, shouldAutoPropagateTemplate } from '../helpers/trainingPropagation.helper';

interface RecurringGym {
  id: string;
  suggested_day_of_week: number;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  source: string | null;
}

interface RecurringEndurance {
  id: string;
  scheduled_day: number | null;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  source: string | null;
}

// Module-level lock to prevent concurrent propagation
let isPropagating = false;

/**
 * Checks future weeks and copies manual plans from the previous week if the target week is empty.
 * @param userId The user's ID.
 * @param weeksToCheck Number of future weeks to check (default 3).
 */
export const propagateTrainingPlans = async (userId: string, weeksToCheck: number = 3) => {
  // Prevent concurrent calls using a simple in-memory lock
  if (isPropagating) {
    console.log('🏋️ [CALENDARIO ENTRENAMIENTO] ⏳ Ya hay una propagación en curso, ignorando...');
    return;
  }
  isPropagating = true;

  try {
    await expireTrainingTemplates(userId, format(new Date(), 'yyyy-MM-dd'));

    console.log('┌─────────────────────────────────────────────────┐');
    console.log('│ 🏋️ [CALENDARIO ENTRENAMIENTO] Verificando...   │');
    console.log('└─────────────────────────────────────────────────┘');

    // Start from current week
    const today = new Date();
    // Start from current week's Monday (or today, but standardizing on weeks is safer for "filling gaps")
    const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 });

    // Calculate total days to check = weeksToCheck * 7
    const daysToCheck = weeksToCheck * 7;
    const endOfWindow = addDays(startOfCurrentWeek, daysToCheck - 1); // e.g., 28 days

    const startDateStr = format(startOfCurrentWeek, 'yyyy-MM-dd');
    const endDateStr = format(endOfWindow, 'yyyy-MM-dd');
    const todayStr = format(today, 'yyyy-MM-dd');

    // Fetch recurring gym templates
    const { data: recurringGym, error: gymError } = await supabase
      .from('workout_templates')
      .select('id, suggested_day_of_week, recurrence_start_date, recurrence_end_date, source')
      .eq('user_id', userId)
      .not('suggested_day_of_week', 'is', null)
      .returns<RecurringGym[]>();

    if (gymError) {
      console.error('🏋️ [CALENDARIO ENTRENAMIENTO] ❌ Error al obtener plantillas de gimnasio:', gymError);
      return;
    }

    // Fetch recurring endurance templates
    const { data: recurringEndurance, error: enduranceError } = await supabase
      .from('endurance_workout_templates')
      .select('id, scheduled_day, recurrence_start_date, recurrence_end_date, source')
      .eq('user_id', userId)
      .not('scheduled_day', 'is', null)
      .returns<RecurringEndurance[]>();

    if (enduranceError) {
      console.error('🏋️ [CALENDARIO ENTRENAMIENTO] ❌ Error al obtener plantillas de resistencia:', enduranceError);
      return;
    }

    const automaticRecurringGym = (recurringGym ?? []).filter(shouldAutoPropagateTemplate);
    const automaticRecurringEndurance = (recurringEndurance ?? []).filter(shouldAutoPropagateTemplate);

    console.log(
      `🏋️ [CALENDARIO ENTRENAMIENTO] Encontradas: ${automaticRecurringGym.length} gimnasio + ${automaticRecurringEndurance.length} resistencia`,
    );

    // 3. Fetch Existing Plans in Window
    // We need to know if a specific template is already instantiated on a specific date.
    const { data: existingPlans, error: plansError } = await supabase
      .from('workout_plans')
      .select('planned_date, gym_template_id, endurance_template_id')
      .eq('user_id', userId)
      .gte('planned_date', startDateStr)
      .lte('planned_date', endDateStr);

    if (plansError) {
      console.error('🏋️ [CALENDARIO ENTRENAMIENTO] ❌ Error al obtener planes existentes:', plansError);
      return;
    }

    // Create a quick lookup set: "YYYY-MM-DD_TemplateID"
    const existingSet = new Set<string>();
    existingPlans?.forEach(p => {
      if (p.gym_template_id) existingSet.add(`${p.planned_date}_gym_${p.gym_template_id}`);
      if (p.endurance_template_id) existingSet.add(`${p.planned_date}_end_${p.endurance_template_id}`);
    });

    console.log(`🏋️ [CALENDARIO ENTRENAMIENTO] 📋 Planes existentes: ${existingSet.size}`);
    console.log(`🏋️ [CALENDARIO ENTRENAMIENTO] 📋 Ejemplo keys:`, Array.from(existingSet).slice(0, 3));

    const plansToInsert: WorkoutPlanInsert[] = [];

    // Iterate through every day in the window
    for (let i = 0; i < daysToCheck; i++) {
      const currentDate = addDays(startOfCurrentWeek, i);
      const dayOfWeek = getDay(currentDate); // 0 = Sunday, 1 = Monday...
      const dateStr = format(currentDate, 'yyyy-MM-dd');

      // Only insert for days AFTER or INCLUDING today (skip only past)
      if (dateStr < todayStr) continue;

      // Check Gym Templates
      automaticRecurringGym.forEach((template: RecurringGym) => {
        if (template.suggested_day_of_week === dayOfWeek && isDateWithinTemplateRecurrence(dateStr, template)) {
          const key = `${dateStr}_gym_${template.id}`;
          if (!existingSet.has(key)) {
            plansToInsert.push({
              user_id: userId,
              planned_date: dateStr,
              gym_template_id: template.id,
            });
            // Add to set to prevent duplicate insertion if logic loops weirdly (though unlikely here)
            existingSet.add(key);
          }
        }
      });

      // Check Endurance Templates
      automaticRecurringEndurance.forEach((template: RecurringEndurance) => {
        if (template.scheduled_day === dayOfWeek && isDateWithinTemplateRecurrence(dateStr, template)) {
          const key = `${dateStr}_end_${template.id}`;
          if (!existingSet.has(key)) {
            plansToInsert.push({
              user_id: userId,
              planned_date: dateStr,
              endurance_template_id: template.id,
            });
            existingSet.add(key);
          }
        }
      });
    }

    if (plansToInsert.length > 0) {
      console.log(`🏋️ [CALENDARIO ENTRENAMIENTO] 📅 Insertando ${plansToInsert.length} planes recurrentes...`);
      console.log(
        `🏋️ [CALENDARIO ENTRENAMIENTO] 📋 Planes a insertar:`,
        plansToInsert.slice(0, 3).map(p => ({
          date: p.planned_date,
          gym: p.gym_template_id,
          endurance: p.endurance_template_id,
        })),
      );
      const { error: insertError } = await supabase.from('workout_plans').insert(plansToInsert);

      if (insertError) {
        console.error('🏋️ [CALENDARIO ENTRENAMIENTO] ❌ Error al insertar planes:', insertError);
      } else {
        console.log(`🏋️ [CALENDARIO ENTRENAMIENTO] ✅ Propagados ${plansToInsert.length} planes correctamente.`);
      }
    } else {
      console.log('🏋️ [CALENDARIO ENTRENAMIENTO] ✓ Calendario al día. No hay nada que insertar.');
    }
  } finally {
    isPropagating = false;
  }
};
