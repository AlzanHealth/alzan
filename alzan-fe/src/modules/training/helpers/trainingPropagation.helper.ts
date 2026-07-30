export type TrainingTemplateSource = {
  source?: string | null;
};

export type TrainingTemplateRecurrence = {
  recurrence_start_date?: string | null;
  recurrence_end_date?: string | null;
};

export const shouldAutoPropagateTemplate = (template: TrainingTemplateSource): boolean =>
  template.source !== 'imported' && template.source !== 'importing';

export const isDateWithinTemplateRecurrence = (plannedDate: string, template: TrainingTemplateRecurrence): boolean => {
  if (template.recurrence_start_date && plannedDate < template.recurrence_start_date) return false;
  if (template.recurrence_end_date && plannedDate > template.recurrence_end_date) return false;
  return true;
};
