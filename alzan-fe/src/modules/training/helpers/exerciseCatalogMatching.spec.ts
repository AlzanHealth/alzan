import assert from 'node:assert/strict';
import {
  exerciseCatalogQueryKey,
  hasMeaningfulExerciseCatalogSearchQuery,
  normalizeExerciseCatalogName,
  rankExerciseCatalogSuggestions,
} from './exerciseCatalogMatching';

assert.equal(
  normalizeExerciseCatalogName('Press øving'),
  normalizeExerciseCatalogName('Press oving'),
  'transliterates characters that PostgreSQL unaccent expands but JavaScript NFD leaves intact',
);
assert.notEqual(
  exerciseCatalogQueryKey('Press øving'),
  exerciseCatalogQueryKey('Press ving'),
  'keeps distinct Unicode inputs separate in exact-match and fuzzy-search caches',
);

const query = 'Press inclinado mancuernas';
const candidates = [
  { id: 'near', names: ['Press inclinado con barra'] },
  { id: 'noise', names: ['Elevación lateral con mancuernas'] },
  { id: 'exact', names: ['Prèss inclinado — mancuernas'] },
  { id: 'typo', names: ['Pres inclinado con mancuernas'] },
];
const suggestions = rankExerciseCatalogSuggestions(query, candidates);

assert.deepEqual(
  suggestions.map(suggestion => suggestion.id),
  ['typo', 'near'],
  'ranks true name similarities and excludes exact matches and shared-equipment noise',
);
assert.ok(suggestions[0].score > suggestions[1].score, 'closer spelling ranks ahead of a different variation');
assert.ok(
  suggestions.every(suggestion => suggestion.score >= 0.38),
  'only suggestions above the threshold are shown',
);

const tokenOrderSuggestion = rankExerciseCatalogSuggestions('sentadilla con barra', [
  { id: 'reordered', names: ['Barra para sentadillas'] },
]);
assert.equal(tokenOrderSuggestion[0]?.id, 'reordered', 'recognizes the same movement words in a different order');

const broadSimilaritySuggestion = rankExerciseCatalogSuggestions('press machine', [
  { id: 'different-equipment', names: ['Press dumbbell'] },
]);
assert.equal(
  broadSimilaritySuggestion[0]?.id,
  'different-equipment',
  'keeps a partially matching movement candidate even when the equipment word differs',
);

assert.deepEqual(
  rankExerciseCatalogSuggestions('de', [
    { id: 'curl', names: ['Curl de bíceps'] },
    { id: 'legs', names: ['Prensa de piernas'] },
  ]),
  [],
  'does not show suggestions based only on a Spanish preposition',
);
assert.deepEqual(
  rankExerciseCatalogSuggestions('con', [
    { id: 'rope', names: ['Curl con cuerda'] },
    { id: 'band', names: ['Extensión con banda'] },
  ]),
  [],
  'does not show suggestions based only on a Spanish conjunction',
);
assert.equal(hasMeaningfulExerciseCatalogSearchQuery('de'), false, 'does not search the catalog for stopwords alone');
assert.equal(hasMeaningfulExerciseCatalogSearchQuery('ab'), false, 'waits for enough signal before fuzzy suggestions');
assert.equal(hasMeaningfulExerciseCatalogSearchQuery('lat'), true, 'enables fuzzy suggestions for a meaningful prefix');
assert.equal(
  rankExerciseCatalogSuggestions('press de banca', [
    { id: 'press', names: ['Press banca con mancuernas'] },
    { id: 'legs', names: ['Prensa de piernas'] },
  ])[0]?.id,
  'press',
  'ignores stopwords while preserving movement-name matching',
);
assert.deepEqual(
  rankExerciseCatalogSuggestions('lat', [{ id: 'plate', names: ['Plate raise'] }]),
  [],
  'does not consider a substring inside another word a similar exercise',
);
assert.equal(
  rankExerciseCatalogSuggestions('calves', [{ id: 'calf', names: ['Calf raise'] }])[0]?.id,
  'calf',
  'recognizes common irregular English singular and plural forms',
);

const canonicalNameSuggestion = rankExerciseCatalogSuggestions('press banca mancuernas', [
  { id: 'edited-alzan', names: ['Mi press personalizado', 'Press banca con mancuernas'] },
]);
assert.equal(
  canonicalNameSuggestion[0]?.id,
  'edited-alzan',
  'keeps the shared Alzan name available for similarity checks after its personal label changes',
);

console.log('Exercise catalog matching checks passed');
