import assert from 'node:assert/strict';
import { buildImportedWorkoutPlans } from './trainingPlanImportCalendar.helper';
import type { ImportedTemplateFamily } from './trainingPlanImportPlanner';

const families: ImportedTemplateFamily[] = [
  {
    familyKey: 'running:easy-run',
    sport: 'running',
    name: 'Rodaje suave',
    workoutGoal: 'endurance',
    modality: 'outdoor',
    signature: 'running-signature',
    sessions: [
      { date: '2026-08-10', sport: 'running', name: 'Rodaje suave' },
      // 2026-08-17 is deliberately absent: imports must never fill weekly gaps.
      { date: '2026-08-24', sport: 'running', name: 'Rodaje suave' },
      // An exact duplicate must not create a second calendar entry.
      { date: '2026-08-24', sport: 'running', name: 'Rodaje suave' },
    ],
  },
  {
    familyKey: 'strength:push',
    sport: 'strength',
    name: 'PUSH',
    workoutGoal: 'hypertrophy',
    modality: 'gym',
    signature: 'strength-signature',
    sessions: [{ date: '2026-08-12', sport: 'strength', name: 'PUSH', notes: 'Sesión importada' }],
  },
];

const templateIds = new Map([
  ['running:easy-run', '11111111-1111-4111-8111-111111111111'],
  ['strength:push', '22222222-2222-4222-8222-222222222222'],
]);

const plans = buildImportedWorkoutPlans('33333333-3333-4333-8333-333333333333', families, templateIds);

assert.deepEqual(
  plans.map(plan => plan.planned_date),
  ['2026-08-10', '2026-08-24', '2026-08-12'],
);
assert.equal(
  plans.some(plan => plan.planned_date === '2026-08-17'),
  false,
);
assert.deepEqual(plans[0], {
  user_id: '33333333-3333-4333-8333-333333333333',
  planned_date: '2026-08-10',
  status: 'planned',
  notes: null,
  import_dedupe_key: 'training-plan-v1:2026-08-10:running:easy-run',
  endurance_template_id: '11111111-1111-4111-8111-111111111111',
});
assert.equal(plans[2].gym_template_id, '22222222-2222-4222-8222-222222222222');
assert.equal(plans[2].notes, 'Sesión importada');

assert.throws(
  () => buildImportedWorkoutPlans('33333333-3333-4333-8333-333333333333', families, new Map()),
  /Missing imported template id/,
);
