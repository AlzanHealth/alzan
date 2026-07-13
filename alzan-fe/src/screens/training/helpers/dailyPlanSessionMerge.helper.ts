export interface MergeableCompletedSession {
  id: string;
  sport_type: string;
  workout_template_id: string | null;
  endurance_template_id: string | null;
  name: string | null;
}

export interface MergeableDailyPlan<TSession extends MergeableCompletedSession> {
  id: string;
  activity_session_id?: string | null;
  gym_template_id?: string | null;
  endurance_template_id?: string | null;
  workout_templates?: { id?: string; base_name?: string | null; sport_type?: string | null } | null;
  endurance_workout_templates?: { id?: string; base_name?: string | null; sport_type?: string | null } | null;
  completedSession?: TSession | null;
}

type MatchedPlan<TPlan, TSession> = TPlan & { completedSession?: TSession | null };

export function matchPlansToCompletedSessions<
  TSession extends MergeableCompletedSession,
  TPlan extends MergeableDailyPlan<TSession>,
>(
  sourcePlans: TPlan[],
  sessions: TSession[],
): { plans: Array<MatchedPlan<TPlan, TSession>>; matchedSessionIds: Set<string> } {
  const plans: Array<MatchedPlan<TPlan, TSession>> = sourcePlans.map(plan => ({ ...plan }));
  const matchedSessionIds = new Set<string>();

  for (const plan of plans) {
    if (!plan.activity_session_id) continue;
    const linkedSession = sessions.find(
      session => session.id === plan.activity_session_id && !matchedSessionIds.has(session.id),
    );
    if (!linkedSession) continue;
    plan.completedSession = linkedSession;
    matchedSessionIds.add(linkedSession.id);
  }

  for (const plan of plans) {
    if (plan.completedSession || plan.activity_session_id) continue;
    const isGym = Boolean(plan.gym_template_id);
    const template = isGym ? plan.workout_templates : plan.endurance_workout_templates;
    const templateId = isGym ? plan.gym_template_id || template?.id : plan.endurance_template_id || template?.id;
    if (!templateId) continue;
    const compatiblePlans = plans.filter(candidate => {
      if (candidate.completedSession || candidate.activity_session_id) return false;
      return isGym
        ? (candidate.gym_template_id || candidate.workout_templates?.id) === templateId
        : (candidate.endurance_template_id || candidate.endurance_workout_templates?.id) === templateId;
    });
    if (compatiblePlans.length !== 1) continue;
    const candidates = sessions.filter(session => {
      if (matchedSessionIds.has(session.id)) return false;
      return isGym ? session.workout_template_id === templateId : session.endurance_template_id === templateId;
    });
    if (candidates.length !== 1) continue;
    plan.completedSession = candidates[0];
    matchedSessionIds.add(candidates[0].id);
  }

  for (const plan of plans) {
    if (plan.completedSession || plan.activity_session_id) continue;
    const isGym = Boolean(plan.gym_template_id);
    const template = isGym ? plan.workout_templates : plan.endurance_workout_templates;
    if (!template?.base_name) continue;
    const legacyCandidates = sessions.filter(session => {
      if (matchedSessionIds.has(session.id) || session.workout_template_id || session.endurance_template_id)
        return false;
      return (
        session.name === template.base_name &&
        (isGym
          ? session.sport_type === 'strength' || session.sport_type === 'gym'
          : session.sport_type === template.sport_type)
      );
    });
    const compatiblePlans = plans.filter(candidate => {
      if (candidate.completedSession || candidate.activity_session_id) return false;
      const candidateTemplate = isGym ? candidate.workout_templates : candidate.endurance_workout_templates;
      return (
        candidateTemplate?.base_name === template.base_name && candidateTemplate?.sport_type === template.sport_type
      );
    });
    if (legacyCandidates.length !== 1 || compatiblePlans.length !== 1) continue;
    plan.completedSession = legacyCandidates[0];
    matchedSessionIds.add(legacyCandidates[0].id);
  }

  return { plans, matchedSessionIds };
}
