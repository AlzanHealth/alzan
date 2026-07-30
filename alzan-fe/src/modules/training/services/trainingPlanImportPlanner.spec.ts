import assert from 'node:assert/strict';
import {
  findReusableImportedTemplate,
  getImportedTemplateScheduledDay,
  groupTrainingPlanSessions,
} from './trainingPlanImportPlanner';
import type { TrainingPlanImportDocument } from './trainingPlanImportContract';

const document: TrainingPlanImportDocument = {
  format: 'alzan-training-plan',
  version: 1,
  plan_name: 'Plan',
  start_date: '2026-08-03',
  end_date: '2026-08-11',
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
assert.equal(getImportedTemplateScheduledDay(groups.find(group => group.sport === 'running')!), 1);
assert.equal(getImportedTemplateScheduledDay(groups.find(group => group.sport === 'strength')!), 2);

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
assert.equal(getImportedTemplateScheduledDay(groupTrainingPlanSessions(structuralDocument)[0]), 1);

const weekdayDates = [
  ['2026-08-02', 0],
  ['2026-08-03', 1],
  ['2026-08-04', 2],
  ['2026-08-05', 3],
  ['2026-08-06', 4],
  ['2026-08-07', 5],
  ['2026-08-08', 6],
] as const;
for (const [date, expectedDay] of weekdayDates) {
  assert.equal(
    getImportedTemplateScheduledDay({
      familyKey: 'test',
      sport: 'running',
      name: 'Test',
      workoutGoal: null,
      modality: null,
      sessions: [{ date, sport: 'running', name: 'Test' }],
      signature: 'test',
    }),
    expectedDay,
  );
}

assert.equal(
  getImportedTemplateScheduledDay({
    familyKey: 'mixed',
    sport: 'running',
    name: 'Mixed',
    workoutGoal: null,
    modality: null,
    sessions: [
      { date: '2026-08-03', sport: 'running', name: 'Mixed' },
      { date: '2026-08-04', sport: 'running', name: 'Mixed' },
    ],
    signature: 'mixed',
  }),
  null,
);

const candidates = [
  {
    id: 'same-range',
    template_family_key: 'strength:gym',
    source: 'imported',
    recurrence_start_date: '2026-08-03',
    recurrence_end_date: '2026-08-30',
  },
  {
    id: 'other-range',
    template_family_key: 'strength:gym',
    source: 'imported',
    recurrence_start_date: '2026-09-01',
    recurrence_end_date: '2026-09-30',
  },
  {
    id: 'manual',
    template_family_key: 'strength:gym',
    source: 'user',
    recurrence_start_date: '2026-08-03',
    recurrence_end_date: '2026-08-30',
  },
];

assert.equal(
  findReusableImportedTemplate(candidates, 'strength:gym', {
    start: '2026-08-03',
    end: '2026-08-30',
  })?.id,
  'same-range',
);
assert.equal(
  findReusableImportedTemplate(candidates, 'strength:gym', {
    start: '2026-10-01',
    end: '2026-10-28',
  }),
  undefined,
);
