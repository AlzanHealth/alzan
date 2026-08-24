export type MenuImportAiIngredientSource = Record<string, unknown> | null;

export type MenuImportAiIngredientCatalogRow = {
  id: string;
  name_es: string;
  name_en: string | null;
  category: string | null;
  unit_basis: string | null;
  kcal_100: number | null;
  protein_g_100: number | null;
  carbs_g_100: number | null;
  fat_g_100: number | null;
  source_primary: MenuImportAiIngredientSource;
};

export type MenuImportAiIngredientCatalogPageFetcher = (
  from: number,
  to: number,
) => Promise<{ data: MenuImportAiIngredientCatalogRow[]; error: Error | null }>;

const CSV_HEADERS = [
  'name_es',
  'name_en',
  'category',
  'unit_basis',
  'kcal_100',
  'protein_g_100',
  'carbs_g_100',
  'fat_g_100',
] as const;

const normalizeSortValue = (value: string | null): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const isRecipeOnly = (row: MenuImportAiIngredientCatalogRow): boolean => {
  const marker = row.source_primary?.recipe_only;
  return marker === true || marker === 'true';
};

const escapeCsvCell = (value: string | number | null): string => {
  const text = value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const sortMenuImportAiIngredients = (
  catalog: MenuImportAiIngredientCatalogRow[],
): MenuImportAiIngredientCatalogRow[] =>
  [...catalog].sort((left, right) => {
    const nameComparison = normalizeSortValue(left.name_es).localeCompare(normalizeSortValue(right.name_es), 'en');
    if (nameComparison !== 0) return nameComparison;
    return left.id.localeCompare(right.id);
  });

export const serializeMenuImportAiIngredientCsv = (catalog: MenuImportAiIngredientCatalogRow[]): string => {
  const rows = sortMenuImportAiIngredients(catalog)
    .filter(row => !isRecipeOnly(row))
    .map(row =>
      [
        row.name_es,
        row.name_en,
        row.category,
        row.unit_basis,
        row.kcal_100,
        row.protein_g_100,
        row.carbs_g_100,
        row.fat_g_100,
      ]
        .map(escapeCsvCell)
        .join(','),
    );

  return ['ingredientes.csv', 'ingredients_rows', CSV_HEADERS.join(','), ...rows].join('\n');
};

export const fetchAllMenuImportAiIngredients = async (
  fetchPage: MenuImportAiIngredientCatalogPageFetcher,
  pageSize = 1000,
): Promise<MenuImportAiIngredientCatalogRow[]> => {
  const rows: MenuImportAiIngredientCatalogRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) throw error;

    rows.push(...data.filter(row => !isRecipeOnly(row)));
    if (data.length < pageSize) break;
  }

  return rows;
};
