import assert from 'node:assert/strict';
import { groupTrainingPlanSessions } from './trainingPlanImportPlanner';
import type { TrainingPlanImportDocument } from './trainingPlanImportContract';

const document: TrainingPlanImportDocument = {
  format: 'alzan-training-plan',
  version: 1,
  plan_name: 'Plan',
  start_date: '2026-08-03',
  weeks: [
    {
      week_number: 1,
      sessions: [
        {
          date: '2026-08-03',
          sport: 'running',
          name: 'Series W1',
          template_key: 'series',
          running_steps: [{ phase_type: 'interval', duration_type: 'distance', distance_m: 800, repetitions: 5 }],
        },
        {
          date: '2026-08-04',
          sport: 'strength',
          name: 'Gym',
          template_key: 'gym',
          exercises: [{ exercise_id: 'squat', order_index: 0, sets: 3, reps: 8, weight_kg: 70 }],
        },
      ],
    },
    {
      week_number: 2,
      sessions: [
        {
          date: '2026-08-10',
          sport: 'running',
          name: 'Series W2',
          template_key: 'series',
          running_steps: [{ phase_type: 'interval', duration_type: 'distance', distance_m: 800, repetitions: 8 }],
        },
        {
          date: '2026-08-11',
          sport: 'strength',
          name: 'Gym',
          template_key: 'gym',
          exercises: [{ exercise_id: 'squat', order_index: 0, sets: 4, reps: 6, weight_kg: 80 }],
        },
      ],
    },
  ],
};

const groups = groupTrainingPlanSessions(document);
assert.equal(groups.length, 2);
assert.equal(groups.find(group => group.sport === 'running')?.sessions.length, 2);
assert.equal(groups.find(group => group.sport === 'strength')?.sessions.length, 2);

const structuralDocument: TrainingPlanImportDocument = {
  ...document,
  weeks: [
    {
      week_number: 1,
      sessions: [
        {
          date: '2026-08-03',
          sport: 'running',
          name: 'Series A',
          running_steps: [{ phase_type: 'interval', duration_type: 'distance', distance_m: 800, repetitions: 5 }],
        },
      ],
    },
    {
      week_number: 2,
      sessions: [
        {
          date: '2026-08-10',
          sport: 'running',
          name: 'Series B',
          running_steps: [{ phase_type: 'interval', duration_type: 'distance', distance_m: 800, repetitions: 8 }],
        },
      ],
    },
  ],
};
assert.equal(groupTrainingPlanSessions(structuralDocument).length, 1);
