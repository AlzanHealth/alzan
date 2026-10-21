import assert from 'node:assert/strict';
import { getExerciseMovementFamily, rankExerciseAlternatives, type AlternativeCandidate } from './exerciseAlternatives';

const make = (id: string, name: string, overrides: Partial<AlternativeCandidate> = {}): AlternativeCandidate => ({
  id,
  names: [name],
  primaryMuscleId: 1,
  secondaryMuscleId: 2,
  equipmentId: 1,
  loadType: 'external',
  exerciseTypeCode: 'Repeticiones',
  archived: false,
  ...overrides,
});
const source = make('source', 'Press de banca con barra');
const rows = [
  source,
  make('fly', 'Aperturas con mancuernas'),
  make('shoulders', 'Press militar con mancuernas'),
  make('other-muscle', 'Bench press', { primaryMuscleId: 8 }),
  make('timed', 'Bench press', { exerciseTypeCode: 'Tiempo' }),
  make('unknown', 'Movimiento personal sin identificar'),
  make('archived', 'Press de pecho', { archived: true }),
  make('in-session', 'Press de banca'),
  make('same-equipment', 'Press de banca con barra'),
  make('other-equipment', 'Dumbbell bench press', { equipmentId: 2 }),
];
const result = rankExerciseAlternatives(source, rows, new Set(['in-session']));
assert.deepEqual(
  result.map(item => item.exerciseId),
  ['other-equipment', 'same-equipment', 'fly', 'shoulders', 'unknown'],
);
assert.ok(result[0]?.reasons.includes('differentEquipment'));
assert.ok(rankExerciseAlternatives(make('unknown-source', 'Mi ejercicio'), rows).length > 0);
assert.deepEqual(rankExerciseAlternatives({ ...source, primaryMuscleId: null }, rows), []);
assert.equal(rankExerciseAlternatives(source, rows, new Set(), 1).length, 1);
assert.deepEqual(
  rankExerciseAlternatives(source, rows).map(item => item.exerciseId),
  rankExerciseAlternatives(source, [...rows].reverse()).map(item => item.exerciseId),
);
for (const [from, to] of [
  ['Remo con barra', 'Seated cable row'],
  ['Jalón al pecho', 'Lat pulldown'],
  ['Sentadilla con barra', 'Leg press'],
  ['Curl de bíceps', 'Dumbbell biceps curl'],
  ['Peso muerto rumano', 'Romanian deadlift'],
  ['Extensión de tríceps', 'Triceps pushdown'],
  ['Elevación de talón', 'Calf raise'],
]) {
  assert.ok(
    rankExerciseAlternatives(make('a', from), [make('b', to)])[0]?.reasons.includes('sameMovement'),
    `${from} / ${to}`,
  );
}
for (const [from, to] of [
  ['Curl de bíceps', 'Curl femoral'],
  ['Peso muerto rumano', 'Hip thrust'],
  ['Sentadilla con barra', 'Extensión de cuádriceps'],
  ['Remo con barra', 'Remo al cuello'],
  ['Press militar', 'Push press'],
  ['Plancha abdominal', 'Crunch abdominal'],
]) {
  assert.ok(
    rankExerciseAlternatives(make('a', from), [make('b', to)]).every(item => !item.reasons.includes('sameMovement')),
    `${from} / ${to}`,
  );
}

// Real catalog names: common incline presses should match each other, while
// compound and unstable variants must rank below a basic bench substitution.
assert.equal(
  getExerciseMovementFamily(['Press inclinado con mancuernas', 'Incline Dumbbell Press']),
  'horizontalPress',
);
assert.equal(
  rankExerciseAlternatives(make('a', 'Press inclinado con mancuernas'), [
    make('b', 'Incline barbell press'),
  ])[0]?.reasons.includes('sameMovement'),
  true,
);
assert.ok(
  !rankExerciseAlternatives(source, [make('decline', 'Press de banca declinado')])[0]?.reasons.includes('sameMovement'),
);
assert.equal(
  getExerciseMovementFamily(['Remo renegado a Flexión con mancuernas', 'Renegade Row to Dumbbell Curl']),
  null,
);
assert.notEqual(getExerciseMovementFamily(['Plancha lateral con Hip Dips']), 'dip');
const practical = rankExerciseAlternatives(source, [
  make('basic', 'Press de banca con mancuernas', { equipmentId: 2 }),
  make('unstable', 'Press de banca con Kettlebell doble Bottoms Up', { equipmentId: 3 }),
  make('combined', 'Remo renegado a Flexión con mancuernas', { equipmentId: 2 }),
  make('ball', 'Chest press balón medicinal', { equipmentId: 4 }),
  make('rotation', 'Press banca mancuernas giro neutro-prono', { equipmentId: 2 }),
]);
assert.deepEqual(
  practical.map(item => item.exerciseId),
  ['basic', 'ball', 'combined', 'rotation', 'unstable'],
);

const fallbackSource = make('custom', 'Demo personal');
const fallback = rankExerciseAlternatives(fallbackSource, [
  make('different', 'Otro', { equipmentId: 2 }),
  make('same', 'Otro'),
]);
assert.deepEqual(
  fallback.map(item => item.exerciseId),
  ['same', 'different'],
);
assert.ok(fallback.every(item => !item.reasons.includes('sameMovement')));
assert.deepEqual(rankExerciseAlternatives(source, rows, new Set(rows.map(row => row.id))), []);
assert.deepEqual(rankExerciseAlternatives({ ...source, archived: true }, rows), []);

console.log('Exercise alternative checks passed');
