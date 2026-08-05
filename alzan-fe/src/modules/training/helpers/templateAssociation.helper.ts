export type TemplateAssociationSport = 'running' | 'strength' | 'gym' | string;

export interface TemplateAssociationPayload {
  endurance_template_id: string | null;
  workout_template_id: string | null;
  workout_plan_id?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);

export const buildTemplateAssociationPayload = ({
  sport,
  templateId,
  workoutPlanId,
}: {
  sport: TemplateAssociationSport;
  templateId: unknown;
  workoutPlanId?: string;
}): TemplateAssociationPayload | null => {
  if (!isUuid(templateId)) return null;

  return {
    endurance_template_id: sport === 'strength' || sport === 'gym' ? null : templateId,
    workout_template_id: sport === 'strength' || sport === 'gym' ? templateId : null,
    workout_plan_id: workoutPlanId,
  };
};
