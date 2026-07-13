import { strict as assert } from 'assert';
import { matchPlansToCompletedSessions } from './dailyPlanSessionMerge.helper';

const session = (id: string, templateId: string | null, name = 'Intervals') => ({
  id,
  sport_type: 'running',
  workout_template_id: null,
  endurance_template_id: templateId,
  name,
});
const plan = (id: string, linkedSessionId: string | null = null) => ({
  id,
  activity_session_id: linkedSessionId,
  gym_template_id: null,
  endurance_template_id: 'template-1',
  workout_templates: null,
  endurance_workout_templates: { id: 'template-1', base_name: 'Intervals', sport_type: 'running' },
});

{
  const result = matchPlansToCompletedSessions([plan('plan-1'), plan('plan-2')], [session('session-1', 'template-1')]);
  assert.equal(
    result.plans.some(candidate => candidate.completedSession),
    false,
  );
  assert.deepEqual([...result.matchedSessionIds], []);
}

{
  const result = matchPlansToCompletedSessions(
    [plan('plan-1', 'session-1'), plan('plan-2')],
    [session('session-1', 'template-1')],
  );
  assert.equal(result.plans[0].completedSession?.id, 'session-1');
  assert.equal(result.plans[1].completedSession, undefined);
  assert.deepEqual([...result.matchedSessionIds], ['session-1']);
}

{
  const legacySession = session('legacy-session', null);
  const result = matchPlansToCompletedSessions([plan('plan-1')], [legacySession]);
  assert.equal(result.plans[0].completedSession?.id, 'legacy-session');
}

{
  const result = matchPlansToCompletedSessions(
    [plan('plan-1')],
    [session('session-1', 'template-1'), session('session-2', 'template-1')],
  );
  assert.equal(result.plans[0].completedSession, undefined);
}
