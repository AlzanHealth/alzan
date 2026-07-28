export type TemplateLifecycleRow = {
  id: string;
  user_id: string;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  auto_delete_after_end: boolean;
};

export type TemplateExpirationPlan = {
  deleteFuturePlansAfter: string;
  preserveHistoryBeforeOrOn: string;
};

export const isTemplateExpired = (template: TemplateLifecycleRow, localDate: string): boolean =>
  template.auto_delete_after_end === true &&
  template.recurrence_end_date != null &&
  template.recurrence_end_date < localDate;

export const buildTemplateExpirationPlan = (
  template: TemplateLifecycleRow,
  localDate: string,
): TemplateExpirationPlan | null => {
  if (!isTemplateExpired(template, localDate) || !template.recurrence_end_date) return null;

  return {
    deleteFuturePlansAfter: template.recurrence_end_date,
    preserveHistoryBeforeOrOn: template.recurrence_end_date,
  };
};
