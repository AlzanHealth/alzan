import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import {
  MENU_IMPORT_MEAL_TYPES,
  MENU_IMPORT_MAX_DAYS,
  MENU_IMPORT_MAX_TEXT_LENGTH,
  parseMenuImportJson,
  type MenuImportValidationErrorCode,
} from './menuImportContract';

type IngredientInput = {
  name: string;
  quantity_g: number;
};

type MealInput = {
  meal_type: string;
  name: string;
  ingredients: IngredientInput[];
};

type DayInput = {
  date: string;
  weekday?: string;
  meals: MealInput[];
};

type MenuInput = {
  format: string;
  version: number;
  menu_name: string;
  days: DayInput[];
};

const ingredient = (overrides: Partial<IngredientInput> = {}): IngredientInput => ({
  name: '  Copos de avena  ',
  quantity_g: 60,
  ...overrides,
});

const meal = (overrides: Partial<MealInput> = {}): MealInput => ({
  meal_type: 'breakfast',
  name: '  Avena con plátano  ',
  ingredients: [ingredient()],
  ...overrides,
});

const day = (overrides: Partial<DayInput> = {}): DayInput => ({
  date: '2026-08-03',
  meals: [meal()],
  ...overrides,
});

const menu = (overrides: Partial<MenuInput> = {}): MenuInput => ({
  format: 'alzan-menu-plan',
  version: 1,
  menu_name: '  Menú semanal  ',
  days: [day()],
  ...overrides,
});

const readTemplateJson = (fileName: string): string =>
  readFileSync(new URL(`../../../../../docs/templates/${fileName}`, import.meta.url), 'utf8');

const getErrors = (rawText: string) => {
  const result = parseMenuImportJson(rawText);
  if (result.ok) {
    throw new Error('Expected menu import parsing to fail');
  }
  return result.errors;
};

const assertValid = (value: unknown) => {
  assert.equal(parseMenuImportJson(JSON.stringify(value)).ok, true);
};

const assertFirstError = (value: unknown, expectedCode: MenuImportValidationErrorCode, expectedPath: string) => {
  const firstError = getErrors(JSON.stringify(value))[0];
  assert.equal(firstError?.code, expectedCode);
  assert.equal(firstError?.path, expectedPath);
};

// Canonical parsing and text-size boundary.
const validResult = parseMenuImportJson(JSON.stringify(menu({ days: [day({ weekday: 'lunes' })] })));
assert.equal(validResult.ok, true);
if (validResult.ok) {
  assert.equal(validResult.value.menu_name, 'Menú semanal');
  assert.equal(validResult.value.days[0]?.meals[0]?.name, 'Avena con plátano');
  assert.equal(validResult.value.days[0]?.meals[0]?.ingredients[0]?.name, 'Copos de avena');
  assert.equal(validResult.value.days[0]?.weekday, 'lunes');
}

// Free AI providers sometimes return the JSON as LaTeX-escaped text and omit
// the opening root brace when copying a property list. This is the output
// shown in the user report; it must import without changing any values.
const escapedAiOutput = String.raw`"format": "alzan-menu-plan", "version": 1, "menu\_name": "Postre con frutos rojos y cereales", "days": \[ { "date": "2026-10-20", "weekday": "martes", "meals": \[ { "meal\_type": "unspecified", "name": "Yogur con frutos rojos y cereales crujientes", "ingredients": \[ { "name": "Yogur natural cremoso", "quantity\_g": 100 }, { "name": "Fresa", "quantity\_g": 70 }, { "name": "Frambuesa", "quantity\_g": 35 }, { "name": "Galletas trituradas", "quantity\_g": 35 }, { "name": "Frutos secos", "quantity\_g": 15 } \] } \] } \] }`;
const escapedAiResult = parseMenuImportJson(escapedAiOutput);
assert.equal(escapedAiResult.ok, true);
if (escapedAiResult.ok) {
  assert.equal(escapedAiResult.value.menu_name, 'Postre con frutos rojos y cereales');
  assert.equal(escapedAiResult.value.days[0]?.meals[0]?.meal_type, 'unspecified');
  assert.deepEqual(
    escapedAiResult.value.days[0]?.meals[0]?.ingredients.map(({ name, quantity_g }) => [name, quantity_g]),
    [
      ['Yogur natural cremoso', 100],
      ['Fresa', 70],
      ['Frambuesa', 35],
      ['Galletas trituradas', 35],
      ['Frutos secos', 15],
    ],
  );
}
assert.equal(parseMenuImportJson(`\uFEFF\n\`\`\`json\n${escapedAiOutput}\n\`\`\`\n`).ok, true);
assert.equal(
  parseMenuImportJson(escapedAiOutput.replace('"quantity\\_g": 100', '"quantity\\_g": "100"')).ok,
  false,
  'presentation recovery must not coerce invalid ingredient quantities',
);
assert.equal(parseMenuImportJson(`"other": 1, ${JSON.stringify(menu()).slice(1)}`).ok, false);

// Mobile Safari can replace JSON delimiters with typographic quotes. The
// frontend accepts only this unambiguous presentation change, not structural repairs.
const mobileJson = JSON.stringify(menu({ days: [day({ weekday: 'lunes' })] })).replace(/"/g, '“');
const mobileResult = parseMenuImportJson(`\u00a0${mobileJson}\u00a0`);
assert.equal(mobileResult.ok, true);
if (mobileResult.ok) {
  assert.equal(mobileResult.value.days[0]?.meals[0]?.ingredients[0]?.name, 'Copos de avena');
}

const fencedMobileResult = parseMenuImportJson('\ufeff```json\n' + mobileJson + '\n```\u00a0');
assert.equal(fencedMobileResult.ok, true);

let quoteIndex = 0;
const pairedMobileJson = JSON.stringify(menu()).replace(/"/g, () => (quoteIndex++ % 2 === 0 ? '“' : '”'));
assert.equal(parseMenuImportJson(pairedMobileJson).ok, true);

const curlyQuoteInName = menu({
  days: [day({ meals: [meal({ ingredients: [ingredient({ name: 'Queso “La Vaca”' })] })] })],
});
const curlyQuoteInNameResult = parseMenuImportJson(JSON.stringify(curlyQuoteInName));
assert.equal(curlyQuoteInNameResult.ok, true);
if (curlyQuoteInNameResult.ok) {
  assert.equal(curlyQuoteInNameResult.value.days[0]?.meals[0]?.ingredients[0]?.name, 'Queso “La Vaca”');
}

assert.equal(parseMenuImportJson(`Antes del JSON\n${JSON.stringify(menu())}`).ok, false);
assert.equal(parseMenuImportJson(JSON.stringify(menu()).replace(/"/g, "'")).ok, false);
assert.equal(parseMenuImportJson(`${JSON.stringify(menu())}${JSON.stringify(menu())}`).ok, false);

const exampleDocument = readTemplateJson('alzan-menu-plan-v1.example.json');
assert.equal(parseMenuImportJson(exampleDocument).ok, true);

const fillableTemplate = JSON.parse(readTemplateJson('alzan-menu-plan-v1.template.json')) as MenuInput;
fillableTemplate.menu_name = 'Menú rellenado';
fillableTemplate.days[0].date = '2026-08-03';
fillableTemplate.days[0].meals[0].name = 'Comida rellenada';
fillableTemplate.days[0].meals[0].ingredients[0].name = 'Ingrediente rellenado';
assert.equal(parseMenuImportJson(JSON.stringify(fillableTemplate)).ok, true);

assert.equal(getErrors('{')[0]?.code, 'invalid_json');
assertFirstError(null, 'invalid_type', '$');
assertFirstError([], 'invalid_type', '$');

const validRawAtTextLimit = JSON.stringify(menu()).padEnd(MENU_IMPORT_MAX_TEXT_LENGTH, ' ');
assert.equal(parseMenuImportJson(validRawAtTextLimit).ok, true);
assert.equal(getErrors(`${validRawAtTextLimit} `)[0]?.code, 'text_too_long');

// Required fields, primitive types, constants, and trimmed text.
assertFirstError({ ...menu(), format: undefined }, 'missing_field', 'format');
assertFirstError({ ...menu(), format: 1 }, 'invalid_type', 'format');
assertFirstError({ ...menu(), format: 'other-menu' }, 'unsupported_format', 'format');
assertFirstError({ ...menu(), version: undefined }, 'missing_field', 'version');
assertFirstError({ ...menu(), version: '1' }, 'invalid_type', 'version');
assertFirstError({ ...menu(), version: 2 }, 'unsupported_version', 'version');
assertFirstError({ ...menu(), menu_name: undefined }, 'missing_field', 'menu_name');
assertFirstError({ ...menu(), menu_name: false }, 'invalid_type', 'menu_name');
assertFirstError({ ...menu(), menu_name: '   ' }, 'invalid_length', 'menu_name');
assertFirstError({ ...menu(), days: undefined }, 'missing_field', 'days');
assertFirstError({ ...menu(), days: {} }, 'invalid_type', 'days');

// Collection limits: one item is covered by the canonical menu; test empty, maximum, and overflow.
assertValid(
  menu({
    days: Array.from({ length: MENU_IMPORT_MAX_DAYS }, (_, index) => {
      const date = new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10);
      return day({ date, weekday: undefined });
    }),
  }),
);
assertFirstError(menu({ days: [] }), 'invalid_length', 'days');
assertFirstError(
  menu({
    days: Array.from({ length: MENU_IMPORT_MAX_DAYS + 1 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10);
      return day({ date, weekday: undefined });
    }),
  }),
  'invalid_length',
  'days',
);
assertFirstError(
  menu({
    days: [day({ date: '2026-08-03' }), day({ date: '2026-08-03' })],
  }),
  'duplicate_date',
  'days[1].date',
);
assertFirstError(
  menu({
    days: [day({ date: '2026-08-03' }), day({ date: '2026-09-17' })],
  }),
  'out_of_range',
  'days',
);

assertValid(menu({ days: [day({ meals: Array.from({ length: 10 }, () => meal()) })] }));
assertFirstError(menu({ days: [day({ meals: [] })] }), 'invalid_length', 'days[0].meals');
assertFirstError(
  menu({ days: [day({ meals: Array.from({ length: 11 }, () => meal()) })] }),
  'invalid_length',
  'days[0].meals',
);

const thirtyIngredients = Array.from({ length: 30 }, (_, index) => ingredient({ name: `Ingrediente ${index + 1}` }));
assertValid(menu({ days: [day({ meals: [meal({ ingredients: thirtyIngredients })] })] }));
assertFirstError(
  menu({ days: [day({ meals: [meal({ ingredients: [] })] })] }),
  'invalid_length',
  'days[0].meals[0].ingredients',
);
assertFirstError(
  menu({ days: [day({ meals: [meal({ ingredients: [...thirtyIngredients, ingredient()] })] })] }),
  'invalid_length',
  'days[0].meals[0].ingredients',
);

// Nested required fields and primitive types.
assertFirstError(menu({ days: [null as unknown as DayInput] }), 'invalid_type', 'days[0]');
assertFirstError(
  menu({ days: [{ ...day(), date: undefined } as unknown as DayInput] }),
  'missing_field',
  'days[0].date',
);
assertFirstError(menu({ days: [{ ...day(), date: 1 } as unknown as DayInput] }), 'invalid_type', 'days[0].date');
assertFirstError(
  menu({ days: [{ ...day(), meals: undefined } as unknown as DayInput] }),
  'missing_field',
  'days[0].meals',
);
assertFirstError(menu({ days: [{ ...day(), meals: {} } as unknown as DayInput] }), 'invalid_type', 'days[0].meals');
assertFirstError(menu({ days: [day({ meals: [null as unknown as MealInput] })] }), 'invalid_type', 'days[0].meals[0]');
assertFirstError(
  menu({ days: [day({ meals: [{ ...meal(), meal_type: undefined } as unknown as MealInput] })] }),
  'missing_field',
  'days[0].meals[0].meal_type',
);
assertFirstError(
  menu({ days: [day({ meals: [{ ...meal(), meal_type: 1 } as unknown as MealInput] })] }),
  'invalid_type',
  'days[0].meals[0].meal_type',
);
assertFirstError(
  menu({ days: [day({ meals: [meal({ meal_type: 'brunch' })] })] }),
  'invalid_meal_type',
  'days[0].meals[0].meal_type',
);
assertValid(menu({ days: [day({ meals: [meal({ meal_type: 'unspecified' })] })] }));
assertFirstError(
  menu({
    days: [
      day({
        meals: [meal({ meal_type: 'unspecified' }), meal({ meal_type: 'dinner', name: 'Cena' })],
      }),
    ],
  }),
  'invalid_meal_type',
  'days[0].meals[0].meal_type',
);
assertFirstError(
  menu({ days: [day({ meals: [{ ...meal(), name: undefined } as unknown as MealInput] })] }),
  'missing_field',
  'days[0].meals[0].name',
);
assertFirstError(
  menu({ days: [day({ meals: [{ ...meal(), name: 1 } as unknown as MealInput] })] }),
  'invalid_type',
  'days[0].meals[0].name',
);
assertFirstError(
  menu({ days: [day({ meals: [{ ...meal(), ingredients: undefined } as unknown as MealInput] })] }),
  'missing_field',
  'days[0].meals[0].ingredients',
);
assertFirstError(
  menu({ days: [day({ meals: [{ ...meal(), ingredients: {} } as unknown as MealInput] })] }),
  'invalid_type',
  'days[0].meals[0].ingredients',
);
assertFirstError(
  menu({ days: [day({ meals: [meal({ ingredients: [null as unknown as IngredientInput] })] })] }),
  'invalid_type',
  'days[0].meals[0].ingredients[0]',
);
assertFirstError(
  menu({
    days: [
      day({
        meals: [meal({ ingredients: [{ ...ingredient(), name: undefined } as unknown as IngredientInput] })],
      }),
    ],
  }),
  'missing_field',
  'days[0].meals[0].ingredients[0].name',
);
assertFirstError(
  menu({
    days: [
      day({
        meals: [meal({ ingredients: [{ ...ingredient(), quantity_g: undefined } as unknown as IngredientInput] })],
      }),
    ],
  }),
  'missing_field',
  'days[0].meals[0].ingredients[0].quantity_g',
);
assertFirstError(
  menu({
    days: [
      day({
        meals: [meal({ ingredients: [{ ...ingredient(), quantity_g: '60' } as unknown as IngredientInput] })],
      }),
    ],
  }),
  'invalid_type',
  'days[0].meals[0].ingredients[0].quantity_g',
);

const daysWithThreeThousandIngredients = Array.from({ length: 10 }, (_, dayIndex) =>
  day({
    date: `2026-08-${String(dayIndex + 1).padStart(2, '0')}`,
    meals: Array.from({ length: 10 }, (_, mealIndex) =>
      meal({
        name: `Comida ${dayIndex + 1}-${mealIndex + 1}`,
        ingredients: thirtyIngredients,
      }),
    ),
  }),
);
assertValid(menu({ days: daysWithThreeThousandIngredients }));

const menuWithThreeThousandAndOneIngredients = menu({
  days: [
    ...daysWithThreeThousandIngredients,
    day({
      date: '2026-08-11',
      meals: [meal({ ingredients: [ingredient()] })],
    }),
  ],
});
assertFirstError(menuWithThreeThousandAndOneIngredients, 'too_many_ingredients', 'days');

const createDaysWithUniqueIngredients = (count: number): DayInput[] => {
  const uniqueIngredients = Array.from({ length: count }, (_, index) =>
    ingredient({ name: `Ingrediente único ${index + 1}` }),
  );

  return Array.from({ length: Math.ceil(uniqueIngredients.length / 30) }, (_, dayIndex) =>
    day({
      date: new Date(Date.UTC(2026, 7, 1 + dayIndex)).toISOString().slice(0, 10),
      meals: [
        meal({
          name: `Comida única ${dayIndex + 1}`,
          ingredients: uniqueIngredients.slice(dayIndex * 30, dayIndex * 30 + 30),
        }),
      ],
    }),
  );
};

assertValid(menu({ days: createDaysWithUniqueIngredients(500) }));
const tooManyUniqueIngredientsResult = parseMenuImportJson(
  JSON.stringify(menu({ days: createDaysWithUniqueIngredients(501) })),
);
assert.equal(tooManyUniqueIngredientsResult.ok, false);
if (!tooManyUniqueIngredientsResult.ok) {
  assert.ok(tooManyUniqueIngredientsResult.errors.some(error => error.code === 'too_many_unique_ingredients'));
}

// Trimmed string lengths and quantity range.
assertValid(
  menu({
    menu_name: 'M',
    days: [day({ meals: [meal({ name: 'C', ingredients: [ingredient({ name: 'I' })] })] })],
  }),
);
assertValid(
  menu({
    menu_name: 'M'.repeat(120),
    days: [
      day({
        meals: [meal({ name: 'C'.repeat(160), ingredients: [ingredient({ name: 'I'.repeat(160) })] })],
      }),
    ],
  }),
);
assertFirstError(menu({ menu_name: 'M'.repeat(121) }), 'invalid_length', 'menu_name');
assertFirstError(
  menu({ days: [day({ meals: [meal({ name: 'C'.repeat(161) })] })] }),
  'invalid_length',
  'days[0].meals[0].name',
);
assertFirstError(
  menu({ days: [day({ meals: [meal({ ingredients: [ingredient({ name: 'I'.repeat(161) })] })] })] }),
  'invalid_length',
  'days[0].meals[0].ingredients[0].name',
);

assertValid(
  menu({
    days: [
      day({
        meals: [meal({ ingredients: [ingredient({ quantity_g: 0.1 }), ingredient({ quantity_g: 10_000 })] })],
      }),
    ],
  }),
);
assertFirstError(
  menu({ days: [day({ meals: [meal({ ingredients: [ingredient({ quantity_g: 0 })] })] })] }),
  'out_of_range',
  'days[0].meals[0].ingredients[0].quantity_g',
);
assertFirstError(
  menu({ days: [day({ meals: [meal({ ingredients: [ingredient({ quantity_g: 10_000.1 })] })] })] }),
  'out_of_range',
  'days[0].meals[0].ingredients[0].quantity_g',
);
const nonFiniteQuantityJson = JSON.stringify(menu()).replace('"quantity_g":60', '"quantity_g":1e309');
const nonFiniteQuantityError = getErrors(nonFiniteQuantityJson)[0];
assert.equal(nonFiniteQuantityError?.code, 'out_of_range');
assert.equal(nonFiniteQuantityError?.path, 'days[0].meals[0].ingredients[0].quantity_g');

// Unknown properties are rejected at every object level.
assertFirstError({ ...menu(), unexpected: true }, 'unknown_property', 'unexpected');
const dayWithUnknownProperty = { ...day(), unexpected: true };
assertFirstError(menu({ days: [dayWithUnknownProperty] }), 'unknown_property', 'days[0].unexpected');
const mealWithUnknownProperty = { ...meal(), unexpected: true };
assertFirstError(
  menu({ days: [day({ meals: [mealWithUnknownProperty] })] }),
  'unknown_property',
  'days[0].meals[0].unexpected',
);
const ingredientWithUnknownProperty = { ...ingredient(), unexpected: true };
assertFirstError(
  menu({
    days: [day({ meals: [meal({ ingredients: [ingredientWithUnknownProperty] })] })],
  }),
  'unknown_property',
  'days[0].meals[0].ingredients[0].unexpected',
);

// Dates must be strict ISO calendar dates, including leap-year behavior.
assertFirstError(menu({ days: [day({ date: '2026-02-30' })] }), 'invalid_date', 'days[0].date');
assertFirstError(menu({ days: [day({ date: '03/08/2026' })] }), 'invalid_date', 'days[0].date');
assertValid(menu({ days: [day({ date: '2028-02-29' })] }));
assertFirstError(menu({ days: [day({ weekday: 'martes' })] }), 'weekday_mismatch', 'days[0].weekday');
assertFirstError(menu({ days: [day({ weekday: 'laborable' })] }), 'invalid_weekday', 'days[0].weekday');

// Every meal slot supported by the database remains accepted by the public contract.
assertValid(
  menu({
    days: [
      day({
        meals: MENU_IMPORT_MEAL_TYPES.map(mealType =>
          meal({
            meal_type: mealType,
            name: `Comida ${mealType}`,
          }),
        ),
      }),
    ],
  }),
);

console.log('menuImportContract: all assertions passed');
