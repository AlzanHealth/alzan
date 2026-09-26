import { isSameDay } from 'date-fns';

interface PlanActionInput {
  activity_session_id?: string | null;
  gym_template_id?: string | null;
  workout_templates?: { id: string } | null;
  planned_date?: string;
  isGym?: boolean;
  isExtraSession?: boolean;
  status?: string;
  completedSession?: { id: string } | null;
}

interface ActiveSessionInput {
  id: string;
  workout_template_id?: string | null;
  start_time: string;
  end_time?: string | null;
}

export function getDailyPlanAction(plan: PlanActionInput, activeSession?: ActiveSessionInput | null) {
  const isGym = Boolean(plan.gym_template_id || plan.isGym);
  const templateId = plan.gym_template_id || plan.workout_templates?.id;
  const isThisSessionActive = Boolean(
    isGym &&
    activeSession &&
    !activeSession.end_time &&
    (plan.activity_session_id
      ? plan.activity_session_id === activeSession.id
      : !plan.completedSession &&
        !plan.isExtraSession &&
        templateId &&
        activeSession.workout_template_id === templateId &&
        isSameDay(new Date(activeSession.start_time), new Date(plan.planned_date || ''))),
  );
  // Starting a planned workout already marks its plan completed. The open
  // session is authoritative until it actually ends.
  const isCompleted =
    !isThisSessionActive && Boolean(plan.isExtraSession || plan.completedSession || plan.status === 'completed');
  return {
    isThisSessionActive,
    isCompleted,
    disabled: isCompleted && !plan.completedSession?.id,
    label: isCompleted
      ? 'training.viewSummary'
      : isThisSessionActive
        ? 'training.resume'
        : isGym
          ? 'training.start'
          : 'training.register',
  } as const;
}
