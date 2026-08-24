import assert from 'node:assert/strict';
import {
  fetchAllMenuImportAiIngredients,
  serializeMenuImportAiIngredientCsv,
  sortMenuImportAiIngredients,
  type MenuImportAiIngredientCatalogRow,
} from './menuImportAiCatalog';

const catalog: MenuImportAiIngredientCatalogRow[] = [
  {
    id: '2',
    name_es: 'Yogur, natural',
    name_en: 'Natural "yogurt"',
    category: 'dairy',
    unit_basis: 'g',
    kcal_100: 63,
    protein_g_100: 3.5,
    carbs_g_100: 4.7,
    fat_g_100: 3.3,
    source_primary: null,
  },
  {
    id: '1',
    name_es: 'Arroz integral cocido',
    name_en: null,
    category: 'cereals',
    unit_basis: 'g',
    kcal_100: 123,
    protein_g_100: 2.7,
    carbs_g_100: 25.6,
    fat_g_100: 1,
    source_primary: null,
  },
  {
    id: '3',
    name_es: 'Salsa interna de receta',
    name_en: null,
    category: 'others',
    unit_basis: 'g',
    kcal_100: 100,
    protein_g_100: 1,
    carbs_g_100: 1,
    fat_g_100: 1,
    source_primary: { recipe_only: true },
  },
];

assert.deepEqual(
  sortMenuImportAiIngredients(catalog).map(row => row.id),
  ['1', '3', '2'],
);

const csv = serializeMenuImportAiIngredientCsv(catalog);
assert.match(
  csv,
  /^ingredientes\.csv\ningredients_rows\nname_es,name_en,category,unit_basis,kcal_100,protein_g_100,carbs_g_100,fat_g_100\n/,
);
assert.ok(csv.includes('Arroz integral cocido,,cereals,g,123,2.7,25.6,1'));
assert.ok(csv.includes('"Yogur, natural","Natural ""yogurt""",dairy,g,63,3.5,4.7,3.3'));
assert.ok(!csv.includes('Salsa interna de receta'));
assert.ok(!csv.includes('\nid,'));

const main = async (): Promise<void> => {
  const ranges: Array<[number, number]> = [];
  const pages = [catalog.slice(0, 2), catalog.slice(2)];
  const result = await fetchAllMenuImportAiIngredients(async (from, to) => {
    ranges.push([from, to]);
    return { data: pages[Math.floor(from / 2)] ?? [], error: null };
  }, 2);

  assert.deepEqual(ranges, [
    [0, 1],
    [2, 3],
  ]);
  assert.equal(result.length, 2, 'recipe-only ingredients must be excluded');
  assert.ok(result.every(row => row.source_primary?.recipe_only !== true));

  await assert.rejects(
    () =>
      fetchAllMenuImportAiIngredients(async () => ({
        data: [],
        error: new Error('catalog unavailable'),
      })),
    /catalog unavailable/,
  );

  console.log('menuImportAiCatalog tests passed');
};

void main();
