import assert from 'node:assert/strict';
import {
  parseTrainingPlanJson,
  TRAINING_PLAN_IMPORT_MAX_EXERCISES_PER_SESSION,
  TRAINING_PLAN_IMPORT_MAX_STEP_DEPTH,
} from './trainingPlanImportContract';
import { toImportedRirBySet } from './trainingPlanImportRir.helper';

const weekdayForDate = (date: string) =>
  ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][
    new Date(`${date}T00:00:00.000Z`).getUTCDay()
  ];

const runningSession = (date: string, template_key = 'base-running') => ({
  date,
  weekday: weekdayForDate(date),
  sport: 'running',
  name: 'Intervalos',
  template_key,
  running_steps: [
    { phase_type: 'warmup', duration_type: 'time', duration_s: 600 },
    { phase_type: 'interval', duration_type: 'distance', distance_m: 800, repetitions: 6, progression_key: 'work' },
  ],
});

const strengthSession = (date: string) => ({
  date,
  weekday: weekdayForDate(date),
  sport: 'strength',
  name: 'Fuerza',
  exercises: [{ exercise_name: 'Sentadilla', order_index: 0, sets: 4, reps: 6, weight_kg: 80 }],
});

const validDocument = {
  format: 'alzan-training-plan',
  version: 1,
  plan_name: 'Base 4 semanas',
  start_date: '2026-08-03',
  end_date: '2026-08-30',
  weeks: [
    { week_number: 1, sessions: [runningSession('2026-08-03'), strengthSession('2026-08-04')] },
    { week_number: 2, sessions: [runningSession('2026-08-10'), strengthSession('2026-08-11')] },
  ],
};

const parsed = parseTrainingPlanJson(JSON.stringify(validDocument));
assert.equal(parsed.ok, true);
if (parsed.ok) {
  assert.equal(parsed.value.weeks.length, 2);
  assert.equal(parsed.value.weeks[0].sessions[0].weekday, 'lunes');
  assert.equal(parsed.value.weeks[0].sessions[0].running_steps?.[1].repetitions, 6);
  assert.equal(parsed.value.weeks[1].sessions[1].exercises?.[0].weight_kg, 80);
  assert.equal(parsed.value.weeks[0].sessions[0].modality, 'outdoor');
  assert.equal(parsed.value.weeks[0].sessions[1].modality, 'gym');
  assert.equal('rir_by_set' in parsed.value.weeks[0].sessions[1].exercises![0], false);
}

const strengthWithPartialRir = {
  ...validDocument,
  weeks: [
    {
      week_number: 1,
      sessions: [
        runningSession('2026-08-03'),
        {
          ...strengthSession('2026-08-04'),
          exercises: [{ exercise_name: 'Sentadilla', order_index: 0, sets: 4, reps: 6, rir_by_set: [0, null, 1, 10] }],
        },
      ],
    },
  ],
};
const parsedStrengthWithPartialRir = parseTrainingPlanJson(JSON.stringify(strengthWithPartialRir));
assert.equal(parsedStrengthWithPartialRir.ok, true);
if (parsedStrengthWithPartialRir.ok) {
  assert.deepEqual(parsedStrengthWithPartialRir.value.weeks[0].sessions[1].exercises?.[0].rir_by_set, [0, null, 1, 10]);
}
assert.equal(
  parseTrainingPlanJson(
    JSON.stringify({
      ...strengthWithPartialRir,
      weeks: [
        {
          ...strengthWithPartialRir.weeks[0],
          sessions: [
            strengthWithPartialRir.weeks[0].sessions[0],
            {
              ...strengthWithPartialRir.weeks[0].sessions[1],
              exercises: [{ exercise_name: 'Sentadilla', order_index: 0, sets: 4, reps: 6, rir_by_set: [3, null, 1] }],
            },
          ],
        },
      ],
    }),
  ).ok,
  false,
  'RIR arrays must have exactly one value per set',
);
assert.equal(
  parseTrainingPlanJson(
    JSON.stringify({
      ...strengthWithPartialRir,
      weeks: [
        {
          ...strengthWithPartialRir.weeks[0],
          sessions: [
            strengthWithPartialRir.weeks[0].sessions[0],
            {
              ...strengthWithPartialRir.weeks[0].sessions[1],
              exercises: [{ exercise_name: 'Sentadilla', order_index: 0, sets: 4, reps: 6, rir_by_set: [3, 11, 1, 0] }],
            },
          ],
        },
      ],
    }),
  ).ok,
  false,
  'RIR values must be integers between zero and ten',
);

assert.equal(toImportedRirBySet(undefined), null, 'omitted RIR must inherit the base target in progressions');
assert.deepEqual(toImportedRirBySet([3, null, 1]), [3, null, 1], 'explicit per-set gaps must be preserved');

const mobileTrainingJson = JSON.stringify(validDocument).replace(/"/g, '“');
const mobileTrainingResult = parseTrainingPlanJson(`\u00a0${mobileTrainingJson}\u00a0`);
assert.equal(mobileTrainingResult.ok, true);
if (mobileTrainingResult.ok) {
  assert.equal(mobileTrainingResult.value.plan_name, 'Base 4 semanas');
  assert.equal(mobileTrainingResult.value.weeks[0]?.sessions[0]?.sport, 'running');
}

const fencedMobileTrainingResult = parseTrainingPlanJson('\ufeff```json\n' + mobileTrainingJson + '\n```\u00a0');
assert.equal(fencedMobileTrainingResult.ok, true);

let trainingQuoteIndex = 0;
const pairedMobileTrainingJson = JSON.stringify(validDocument).replace(/"/g, () =>
  trainingQuoteIndex++ % 2 === 0 ? '“' : '”',
);
assert.equal(parseTrainingPlanJson(pairedMobileTrainingJson).ok, true);

const curlyQuoteInTrainingName = {
  ...validDocument,
  plan_name: 'Plan “Base”',
};
const curlyQuoteInTrainingNameResult = parseTrainingPlanJson(JSON.stringify(curlyQuoteInTrainingName));
assert.equal(curlyQuoteInTrainingNameResult.ok, true);
if (curlyQuoteInTrainingNameResult.ok) {
  assert.equal(curlyQuoteInTrainingNameResult.value.plan_name, 'Plan “Base”');
}

assert.equal(parseTrainingPlanJson(`Antes del JSON\n${JSON.stringify(validDocument)}`).ok, false);
assert.equal(parseTrainingPlanJson(JSON.stringify(validDocument).replace(/"/g, "'")).ok, false);
assert.equal(parseTrainingPlanJson(`${JSON.stringify(validDocument)}${JSON.stringify(validDocument)}`).ok, false);

const normalizedMetadata = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          { ...runningSession('2026-08-03'), workout_goal: 'Tempo', modality: 'Outdoor' },
          { ...strengthSession('2026-08-04'), workout_goal: 'Fuerza', modality: 'Free Weights' },
        ],
      },
    ],
  }),
);
assert.equal(normalizedMetadata.ok, true);
if (normalizedMetadata.ok) {
  assert.equal(normalizedMetadata.value.weeks[0].sessions[0].workout_goal, 'tempo_threshold');
  assert.equal(normalizedMetadata.value.weeks[0].sessions[0].modality, 'outdoor');
  assert.equal(normalizedMetadata.value.weeks[0].sessions[1].workout_goal, 'strength');
  assert.equal(normalizedMetadata.value.weeks[0].sessions[1].modality, 'free_weights');
}

const invalidMetadata = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          { ...runningSession('2026-08-03'), workout_goal: 'inventado' },
          { ...strengthSession('2026-08-04'), modality: 'parque' },
        ],
      },
    ],
  }),
);
assert.equal(invalidMetadata.ok, false);
if (!invalidMetadata.ok) {
  assert.deepEqual(
    invalidMetadata.errors.filter(error => error.code === 'invalid_session_metadata').map(error => error.path),
    ['weeks[0].sessions[0].workout_goal', 'weeks[0].sessions[1].modality'],
  );
}

const legacyNotes = {
  ...validDocument,
  weeks: [
    {
      ...validDocument.weeks[0],
      sessions: [
        { ...validDocument.weeks[0].sessions[0], notes: 'x'.repeat(2000) },
        {
          ...validDocument.weeks[0].sessions[1],
          exercises: [
            {
              exercise_name: 'Sentadilla',
              order_index: 0,
              sets: 4,
              reps: 6,
              notes: 'y'.repeat(2000),
              rir: 2,
              rir_min: 2,
              rir_max: 3,
            },
          ],
        },
      ],
    },
  ],
};
const parsedLegacyNotes = parseTrainingPlanJson(JSON.stringify(legacyNotes));
assert.equal(parsedLegacyNotes.ok, true);
if (parsedLegacyNotes.ok) {
  assert.equal('notes' in parsedLegacyNotes.value.weeks[0].sessions[0], false);
  assert.equal('notes' in parsedLegacyNotes.value.weeks[0].sessions[1].exercises![0], false);
  assert.equal('rir' in parsedLegacyNotes.value.weeks[0].sessions[1].exercises![0], false);
  assert.equal('rir_min' in parsedLegacyNotes.value.weeks[0].sessions[1].exercises![0], false);
  assert.equal('rir_max' in parsedLegacyNotes.value.weeks[0].sessions[1].exercises![0], false);
}

const duplicate = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [{ week_number: 1, sessions: [runningSession('2026-08-03'), runningSession('2026-08-03')] }],
  }),
);
assert.equal(duplicate.ok, false);
if (!duplicate.ok) assert.ok(duplicate.errors.some(error => error.code === 'duplicate_date'));

const normalizedDuplicate = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [runningSession('2026-08-03', 'Series 800'), runningSession('2026-08-03', 'series-800')],
      },
    ],
  }),
);
assert.equal(normalizedDuplicate.ok, false);
if (!normalizedDuplicate.ok) {
  assert.ok(normalizedDuplicate.errors.some(error => error.code === 'duplicate_date'));
}

const maxRange = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    end_date: '2026-09-16',
  }),
);
assert.equal(maxRange.ok, true);

const tooLongRange = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    end_date: '2026-09-17',
  }),
);
assert.equal(tooLongRange.ok, false);
if (!tooLongRange.ok) assert.ok(tooLongRange.errors.some(error => error.code === 'invalid_range'));

const missingEndDate = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    end_date: undefined,
  }),
);
assert.equal(missingEndDate.ok, false);
if (!missingEndDate.ok) {
  assert.ok(missingEndDate.errors.some(error => error.code === 'missing_field' && error.path === 'end_date'));
}

const unsupportedSport = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [{ week_number: 1, sessions: [{ ...runningSession('2026-08-03'), sport: 'cycling' }] }],
  }),
);
assert.equal(unsupportedSport.ok, false);
if (!unsupportedSport.ok) assert.ok(unsupportedSport.errors.some(error => error.code === 'unsupported_sport'));

const crossSportFields = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...runningSession('2026-08-03'),
            exercises: [{ exercise_name: 'Sentadilla', order_index: 0, sets: 3, reps: 8 }],
          },
          {
            ...strengthSession('2026-08-04'),
            running_steps: [{ phase_type: 'warmup', duration_type: 'time', duration_s: 600 }],
          },
        ],
      },
    ],
  }),
);
assert.equal(crossSportFields.ok, false);
if (!crossSportFields.ok) {
  assert.ok(crossSportFields.errors.some(error => error.path.endsWith('.exercises')));
  assert.ok(crossSportFields.errors.some(error => error.path.endsWith('.running_steps')));
}

const mismatchedWeekday = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [{ week_number: 1, sessions: [{ ...runningSession('2026-08-03'), weekday: 'martes' }] }],
  }),
);
assert.equal(mismatchedWeekday.ok, false);
if (!mismatchedWeekday.ok) assert.ok(mismatchedWeekday.errors.some(error => error.code === 'weekday_mismatch'));

const invalidExerciseId = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...strengthSession('2026-08-04'),
            exercises: [
              {
                exercise_id: 'REEMPLAZAR_UUID',
                exercise_name: 'Sentadilla',
                order_index: 0,
                sets: 4,
                reps: 6,
              },
            ],
          },
        ],
      },
    ],
  }),
);
assert.equal(invalidExerciseId.ok, false);
if (!invalidExerciseId.ok) {
  assert.ok(
    invalidExerciseId.errors.some(
      error => error.code === 'invalid_session_shape' && error.path.endsWith('.exercise_id'),
    ),
  );
}

const duplicateExerciseOrder = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...strengthSession('2026-08-04'),
            exercises: [
              { exercise_name: 'Sentadilla', order_index: 0, sets: 3, reps: 8 },
              { exercise_name: 'Peso muerto', order_index: 0, sets: 3, reps: 8 },
            ],
          },
        ],
      },
    ],
  }),
);
assert.equal(duplicateExerciseOrder.ok, false);
if (!duplicateExerciseOrder.ok) {
  assert.ok(duplicateExerciseOrder.errors.some(error => error.code === 'invalid_session_shape'));
}

const incompatibleTemplateFamily = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...strengthSession('2026-08-04'),
            template_key: 'full-body',
            exercises: [{ exercise_name: 'Sentadilla', order_index: 0, sets: 3, reps: 8 }],
          },
        ],
      },
      {
        week_number: 2,
        sessions: [
          {
            ...strengthSession('2026-08-11'),
            template_key: 'full-body',
            exercises: [{ exercise_name: 'Peso muerto', order_index: 0, sets: 3, reps: 8 }],
          },
        ],
      },
    ],
  }),
);
assert.equal(incompatibleTemplateFamily.ok, false);
if (!incompatibleTemplateFamily.ok) {
  assert.ok(incompatibleTemplateFamily.errors.some(error => error.code === 'incompatible_template_family'));
  assert.ok(incompatibleTemplateFamily.errors.some(error => error.message.includes('different template_key')));
}

const tooManyExercises = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...strengthSession('2026-08-04'),
            exercises: Array.from({ length: TRAINING_PLAN_IMPORT_MAX_EXERCISES_PER_SESSION + 1 }, (_, index) => ({
              exercise_name: `Ejercicio ${index}`,
              order_index: index,
              sets: 3,
              reps: 8,
            })),
          },
        ],
      },
    ],
  }),
);
assert.equal(tooManyExercises.ok, false);
if (!tooManyExercises.ok) {
  assert.ok(
    tooManyExercises.errors.some(error => error.code === 'invalid_length' && error.path.endsWith('.exercises')),
  );
}

const buildNestedStep = (remainingDepth: number): Record<string, unknown> => ({
  phase_type: 'interval',
  duration_type: 'time',
  ...(remainingDepth > 0 ? { children: [buildNestedStep(remainingDepth - 1)] } : { duration_s: 60 }),
});
const excessivelyNestedSteps = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...runningSession('2026-08-03'),
            running_steps: [buildNestedStep(TRAINING_PLAN_IMPORT_MAX_STEP_DEPTH)],
          },
        ],
      },
    ],
  }),
);
assert.equal(excessivelyNestedSteps.ok, false);
if (!excessivelyNestedSteps.ok) {
  assert.ok(excessivelyNestedSteps.errors.some(error => error.code === 'invalid_length'));
}

const duplicateProgressionKey = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...runningSession('2026-08-03'),
            running_steps: [
              {
                phase_type: 'interval',
                duration_type: 'lap_button',
                repetitions: 4,
                progression_key: 'work',
                children: [
                  {
                    phase_type: 'interval',
                    duration_type: 'distance',
                    distance_m: 800,
                    progression_key: 'work',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }),
);
assert.equal(duplicateProgressionKey.ok, false);
if (!duplicateProgressionKey.ok) {
  assert.ok(
    duplicateProgressionKey.errors.some(
      error => error.code === 'invalid_session_shape' && error.path.endsWith('.running_steps'),
    ),
  );
}

const conflictingSameWeekFamily = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    end_date: '2026-08-09',
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...strengthSession('2026-08-04'),
            template_key: 'full-body',
            exercises: [{ exercise_name: 'Sentadilla', order_index: 0, sets: 3, reps: 8 }],
          },
          {
            ...strengthSession('2026-08-06'),
            template_key: 'full-body',
            exercises: [{ exercise_name: 'Sentadilla', order_index: 0, sets: 4, reps: 6 }],
          },
        ],
      },
    ],
  }),
);
assert.equal(conflictingSameWeekFamily.ok, false);
if (!conflictingSameWeekFamily.ok) {
  assert.ok(conflictingSameWeekFamily.errors.some(error => error.code === 'incompatible_template_family'));
}

const repeatedIdenticalSameWeekFamily = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    end_date: '2026-08-09',
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...strengthSession('2026-08-04'),
            template_key: 'full-body',
          },
          {
            ...strengthSession('2026-08-06'),
            template_key: 'full-body',
          },
        ],
      },
    ],
  }),
);
assert.equal(repeatedIdenticalSameWeekFamily.ok, true);

const conflictingRunningSummarySameWeek = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    end_date: '2026-08-09',
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...runningSession('2026-08-03', 'easy-run'),
            distance_km: 5,
            duration_min: 30,
          },
          {
            ...runningSession('2026-08-06', 'easy-run'),
            distance_km: 8,
            duration_min: 45,
          },
        ],
      },
    ],
  }),
);
assert.equal(conflictingRunningSummarySameWeek.ok, false);
if (!conflictingRunningSummarySameWeek.ok) {
  assert.ok(conflictingRunningSummarySameWeek.errors.some(error => error.code === 'incompatible_template_family'));
}

const unstableRunningProgressionKeys = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [runningSession('2026-08-03', 'series')],
      },
      {
        week_number: 2,
        sessions: [
          {
            ...runningSession('2026-08-10', 'series'),
            running_steps: [
              { phase_type: 'warmup', duration_type: 'time', duration_s: 600 },
              {
                phase_type: 'interval',
                duration_type: 'distance',
                distance_m: 1000,
                repetitions: 5,
                progression_key: 'renamed-work',
              },
            ],
          },
        ],
      },
    ],
  }),
);
assert.equal(unstableRunningProgressionKeys.ok, false);
if (!unstableRunningProgressionKeys.ok) {
  assert.ok(unstableRunningProgressionKeys.errors.some(error => error.code === 'incompatible_template_family'));
}

const fractionalIntegerFields = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1.5,
        sessions: [
          {
            ...strengthSession('2026-08-04'),
            exercises: [
              {
                exercise_name: 'Sentadilla',
                order_index: 0,
                sets: 3.5,
                reps: 8.5,
                rest_seconds: 90.5,
              },
            ],
          },
        ],
      },
    ],
  }),
);
assert.equal(fractionalIntegerFields.ok, false);
if (!fractionalIntegerFields.ok) {
  assert.ok(fractionalIntegerFields.errors.some(error => error.path.endsWith('.week_number')));
  assert.ok(fractionalIntegerFields.errors.some(error => error.path.endsWith('.sets')));
}

const missingRunningDistance = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...runningSession('2026-08-03'),
            running_steps: [{ phase_type: 'interval', duration_type: 'distance' }],
          },
        ],
      },
    ],
  }),
);
assert.equal(missingRunningDistance.ok, false);
if (!missingRunningDistance.ok) {
  assert.ok(missingRunningDistance.errors.some(error => error.code === 'invalid_session_shape'));
}

const incoherentRunningTargets = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...runningSession('2026-08-03'),
            running_steps: [
              {
                phase_type: 'interval',
                duration_type: 'distance',
                distance_m: 800,
                target_min: 285,
              },
              {
                phase_type: 'recovery',
                duration_type: 'time',
                duration_s: 90,
                target_type: 'pace',
              },
            ],
          },
        ],
      },
    ],
  }),
);
assert.equal(incoherentRunningTargets.ok, false);
if (!incoherentRunningTargets.ok) {
  assert.ok(incoherentRunningTargets.errors.some(error => error.path.endsWith('.target_type')));
  assert.ok(incoherentRunningTargets.errors.some(error => error.path.endsWith('.target_min')));
}

const invertedRepRange = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [
      {
        week_number: 1,
        sessions: [
          {
            ...strengthSession('2026-08-04'),
            exercises: [
              {
                exercise_name: 'Sentadilla',
                order_index: 0,
                sets: 3,
                reps_min: 12,
                reps_max: 8,
              },
            ],
          },
        ],
      },
    ],
  }),
);
assert.equal(invertedRepRange.ok, false);
if (!invertedRepRange.ok) {
  assert.ok(invertedRepRange.errors.some(error => error.path.endsWith('.reps_max')));
}

const emptyPlan = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [{ week_number: 1, sessions: [] }],
  }),
);
assert.equal(emptyPlan.ok, false);
if (!emptyPlan.ok) {
  assert.ok(emptyPlan.errors.some(error => error.code === 'invalid_length' && error.path === 'weeks'));
}
