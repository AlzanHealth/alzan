import type { WorkoutPlanInsert } from '../../../types/requests.types';
import type { ImportedTemplateFamily } from './trainingPlanImportPlanner';

/**
 * Builds only the calendar entries explicitly declared by the imported JSON.
 * No dates are inferred from weekdays or gaps between imported sessions.
 */
export const buildImportedWorkoutPlans = (
  userId: string,
  families: ImportedTemplateFamily[],
  templateIdsByFamily: ReadonlyMap<string, string>,
): WorkoutPlanInsert[] => {
  const requestedPlansByDateAndTemplate = new Map<string, WorkoutPlanInsert>();

  families.forEach(family => {
    const templateId = templateIdsByFamily.get(family.familyKey);
    if (!templateId) {
      throw new Error(`Missing imported template id for family ${family.familyKey}`);
    }

    family.sessions.forEach(session => {
      const plan: WorkoutPlanInsert = {
        user_id: userId,
        planned_date: session.date,
        status: 'planned',
        notes: session.notes ?? null,
        import_dedupe_key: `training-plan-v1:${session.date}:${family.familyKey}`,
        ...(family.sport === 'running' ? { endurance_template_id: templateId } : { gym_template_id: templateId }),
      };
      requestedPlansByDateAndTemplate.set(`${session.date}:${templateId}`, plan);
    });
  });

  return [...requestedPlansByDateAndTemplate.values()];
};
