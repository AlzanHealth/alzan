export const MENU_IMPORT_FORMAT = 'alzan-menu-plan';
export const MENU_IMPORT_VERSION = 1;
export const MENU_IMPORT_MAX_DAYS = 45;
export const MENU_IMPORT_MAX_TEXT_LENGTH = 500_000;
export const MENU_IMPORT_MAX_TOTAL_INGREDIENTS = 3_000;
export const MENU_IMPORT_MAX_UNIQUE_INGREDIENTS = 500;
export const MENU_IMPORT_MEAL_TYPES = ['breakfast', 'almuerzo', 'lunch', 'merienda', 'dinner', 'snack'] as const;

export type MenuImportMealType = (typeof MENU_IMPORT_MEAL_TYPES)[number];

export type MenuImportIngredient = {
  name: string;
  quantity_g: number;
};

export type MenuImportMeal = {
  meal_type: MenuImportMealType;
  name: string;
  ingredients: MenuImportIngredient[];
};

export type MenuImportDay = {
  date: string;
  weekday?: string;
  meals: MenuImportMeal[];
};

export type MenuImportDocument = {
  format: typeof MENU_IMPORT_FORMAT;
  version: typeof MENU_IMPORT_VERSION;
  menu_name: string;
  days: MenuImportDay[];
};

export type MenuImportValidationErrorCode =
  | 'invalid_json'
  | 'text_too_long'
  | 'invalid_type'
  | 'missing_field'
  | 'unknown_property'
  | 'unsupported_format'
  | 'unsupported_version'
  | 'invalid_length'
  | 'invalid_date'
  | 'duplicate_date'
  | 'invalid_weekday'
  | 'weekday_mismatch'
  | 'invalid_meal_type'
  | 'out_of_range'
  | 'too_many_ingredients'
  | 'too_many_unique_ingredients';

export type MenuImportValidationError = {
  code: MenuImportValidationErrorCode;
  path: string;
  message: string;
};

export type MenuImportParseResult =
  | { ok: true; value: MenuImportDocument }
  | { ok: false; errors: MenuImportValidationError[] };

type ValidationContext = {
  errors: MenuImportValidationError[];
  totalIngredientCount: number;
  uniqueIngredientKeys: Set<string>;
};

const ROOT_KEYS = ['format', 'version', 'menu_name', 'days'];
const DAY_KEYS = ['date', 'weekday', 'meals'];
const MEAL_KEYS = ['meal_type', 'name', 'ingredients'];
const INGREDIENT_KEYS = ['name', 'quantity_g'];
const MEAL_TYPE_VALUES: ReadonlySet<string> = new Set(MENU_IMPORT_MEAL_TYPES);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_ALIASES: Record<string, string> = {
  domingo: 'domingo',
  sunday: 'domingo',
  lunes: 'lunes',
  monday: 'lunes',
  martes: 'martes',
  tuesday: 'martes',
  miercoles: 'miércoles',
  miércoles: 'miércoles',
  wednesday: 'miércoles',
  jueves: 'jueves',
  thursday: 'jueves',
  viernes: 'viernes',
  friday: 'viernes',
  sabado: 'sábado',
  sábado: 'sábado',
  saturday: 'sábado',
};

const normalizeWeekday = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const normalizeIngredientName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const getWeekdayForDate = (date: string): string =>
  ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][
    new Date(`${date}T00:00:00.000Z`).getUTCDay()
  ];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const addError = (context: ValidationContext, code: MenuImportValidationErrorCode, path: string, message: string) => {
  context.errors.push({ code, path, message });
};

const addUnknownPropertyErrors = (
  value: Record<string, unknown>,
  allowedKeys: string[],
  path: string,
  context: ValidationContext,
) => {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      addError(context, 'unknown_property', path.length > 0 ? `${path}.${key}` : key, `Unknown property "${key}"`);
    }
  }
};

const readTrimmedString = (
  value: unknown,
  path: string,
  maxLength: number,
  context: ValidationContext,
): string | null => {
  if (value === undefined) {
    addError(context, 'missing_field', path, 'Required field is missing');
    return null;
  }
  if (typeof value !== 'string') {
    addError(context, 'invalid_type', path, 'Expected a string');
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > maxLength) {
    addError(context, 'invalid_length', path, `Expected between 1 and ${maxLength} characters`);
    return null;
  }
  return trimmed;
};

const isIsoDate = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const isMenuImportMealType = (value: string): value is MenuImportMealType => MEAL_TYPE_VALUES.has(value);

const parseIngredient = (value: unknown, path: string, context: ValidationContext): MenuImportIngredient | null => {
  if (!isRecord(value)) {
    addError(context, 'invalid_type', path, 'Expected an object');
    return null;
  }

  addUnknownPropertyErrors(value, INGREDIENT_KEYS, path, context);
  const name = readTrimmedString(value.name, `${path}.name`, 160, context);
  if (name !== null) {
    context.uniqueIngredientKeys.add(normalizeIngredientName(name));
  }
  const rawQuantity = value.quantity_g;
  let quantity: number | null = null;

  if (rawQuantity === undefined) {
    addError(context, 'missing_field', `${path}.quantity_g`, 'Required field is missing');
  } else if (typeof rawQuantity !== 'number') {
    addError(context, 'invalid_type', `${path}.quantity_g`, 'Expected a number');
  } else if (!Number.isFinite(rawQuantity) || rawQuantity < 0.1 || rawQuantity > 10_000) {
    addError(context, 'out_of_range', `${path}.quantity_g`, 'Expected a finite number between 0.1 and 10000');
  } else {
    quantity = rawQuantity;
  }

  return name === null || quantity === null ? null : { name, quantity_g: quantity };
};

const parseMeal = (value: unknown, path: string, context: ValidationContext): MenuImportMeal | null => {
  if (!isRecord(value)) {
    addError(context, 'invalid_type', path, 'Expected an object');
    return null;
  }

  addUnknownPropertyErrors(value, MEAL_KEYS, path, context);

  const rawMealType = value.meal_type;
  let mealType: MenuImportMealType | null = null;
  if (rawMealType === undefined) {
    addError(context, 'missing_field', `${path}.meal_type`, 'Required field is missing');
  } else if (typeof rawMealType !== 'string') {
    addError(context, 'invalid_type', `${path}.meal_type`, 'Expected a string');
  } else if (!isMenuImportMealType(rawMealType)) {
    addError(context, 'invalid_meal_type', `${path}.meal_type`, 'Unknown meal type');
  } else {
    mealType = rawMealType;
  }

  const name = readTrimmedString(value.name, `${path}.name`, 160, context);
  const rawIngredients = value.ingredients;
  const ingredients: MenuImportIngredient[] = [];
  let hasValidIngredientsArray = false;

  if (rawIngredients === undefined) {
    addError(context, 'missing_field', `${path}.ingredients`, 'Required field is missing');
  } else if (!Array.isArray(rawIngredients)) {
    addError(context, 'invalid_type', `${path}.ingredients`, 'Expected an array');
  } else {
    hasValidIngredientsArray = true;
    context.totalIngredientCount += rawIngredients.length;
    if (rawIngredients.length < 1 || rawIngredients.length > 30) {
      addError(context, 'invalid_length', `${path}.ingredients`, 'Expected between 1 and 30 ingredients');
    }
    rawIngredients.forEach((ingredient, index) => {
      const parsedIngredient = parseIngredient(ingredient, `${path}.ingredients[${index}]`, context);
      if (parsedIngredient !== null) {
        ingredients.push(parsedIngredient);
      }
    });
  }

  if (mealType === null || name === null || !hasValidIngredientsArray) {
    return null;
  }
  return { meal_type: mealType, name, ingredients };
};

const parseDay = (value: unknown, path: string, context: ValidationContext): MenuImportDay | null => {
  if (!isRecord(value)) {
    addError(context, 'invalid_type', path, 'Expected an object');
    return null;
  }

  addUnknownPropertyErrors(value, DAY_KEYS, path, context);

  const rawDate = value.date;
  let date: string | null = null;
  if (rawDate === undefined) {
    addError(context, 'missing_field', `${path}.date`, 'Required field is missing');
  } else if (typeof rawDate !== 'string') {
    addError(context, 'invalid_type', `${path}.date`, 'Expected a string');
  } else if (!isIsoDate(rawDate)) {
    addError(context, 'invalid_date', `${path}.date`, 'Expected a real date in YYYY-MM-DD format');
  } else {
    date = rawDate;
  }

  const rawWeekday = value.weekday;
  let weekday: string | undefined;
  if (rawWeekday !== undefined) {
    if (typeof rawWeekday !== 'string') {
      addError(context, 'invalid_type', `${path}.weekday`, 'Expected a string');
    } else {
      const normalizedWeekday = WEEKDAY_ALIASES[normalizeWeekday(rawWeekday)];
      if (!normalizedWeekday) {
        addError(context, 'invalid_weekday', `${path}.weekday`, 'Unsupported weekday');
      } else {
        weekday = normalizedWeekday;
        if (date !== null && weekday !== getWeekdayForDate(date)) {
          addError(
            context,
            'weekday_mismatch',
            `${path}.weekday`,
            `Weekday does not match ${date}; expected ${getWeekdayForDate(date)}`,
          );
        }
      }
    }
  }

  const rawMeals = value.meals;
  const meals: MenuImportMeal[] = [];
  let hasValidMealsArray = false;

  if (rawMeals === undefined) {
    addError(context, 'missing_field', `${path}.meals`, 'Required field is missing');
  } else if (!Array.isArray(rawMeals)) {
    addError(context, 'invalid_type', `${path}.meals`, 'Expected an array');
  } else {
    hasValidMealsArray = true;
    if (rawMeals.length < 1 || rawMeals.length > 10) {
      addError(context, 'invalid_length', `${path}.meals`, 'Expected between 1 and 10 meals');
    }
    rawMeals.forEach((meal, index) => {
      const parsedMeal = parseMeal(meal, `${path}.meals[${index}]`, context);
      if (parsedMeal !== null) {
        meals.push(parsedMeal);
      }
    });
  }

  if (date === null || !hasValidMealsArray) {
    return null;
  }
  return { date, ...(weekday ? { weekday } : {}), meals };
};

const parseDocument = (value: unknown, context: ValidationContext): MenuImportDocument | null => {
  if (!isRecord(value)) {
    addError(context, 'invalid_type', '$', 'Expected a JSON object');
    return null;
  }

  addUnknownPropertyErrors(value, ROOT_KEYS, '', context);

  const rawFormat = value.format;
  let hasValidFormat = false;
  if (rawFormat === undefined) {
    addError(context, 'missing_field', 'format', 'Required field is missing');
  } else if (typeof rawFormat !== 'string') {
    addError(context, 'invalid_type', 'format', 'Expected a string');
  } else if (rawFormat !== MENU_IMPORT_FORMAT) {
    addError(context, 'unsupported_format', 'format', `Expected "${MENU_IMPORT_FORMAT}"`);
  } else {
    hasValidFormat = true;
  }

  const rawVersion = value.version;
  let hasValidVersion = false;
  if (rawVersion === undefined) {
    addError(context, 'missing_field', 'version', 'Required field is missing');
  } else if (typeof rawVersion !== 'number') {
    addError(context, 'invalid_type', 'version', 'Expected a number');
  } else if (rawVersion !== MENU_IMPORT_VERSION) {
    addError(context, 'unsupported_version', 'version', `Expected version ${MENU_IMPORT_VERSION}`);
  } else {
    hasValidVersion = true;
  }

  const menuName = readTrimmedString(value.menu_name, 'menu_name', 120, context);
  const rawDays = value.days;
  const days: MenuImportDay[] = [];
  let hasValidDaysArray = false;

  if (rawDays === undefined) {
    addError(context, 'missing_field', 'days', 'Required field is missing');
  } else if (!Array.isArray(rawDays)) {
    addError(context, 'invalid_type', 'days', 'Expected an array');
  } else {
    hasValidDaysArray = true;
    const seenDates = new Set<string>();
    if (rawDays.length < 1 || rawDays.length > MENU_IMPORT_MAX_DAYS) {
      addError(context, 'invalid_length', 'days', `Expected between 1 and ${MENU_IMPORT_MAX_DAYS} days`);
    }
    rawDays.forEach((day, index) => {
      const parsedDay = parseDay(day, `days[${index}]`, context);
      if (parsedDay !== null) {
        if (seenDates.has(parsedDay.date)) {
          addError(context, 'duplicate_date', `days[${index}].date`, 'Each date must appear only once');
        }
        seenDates.add(parsedDay.date);
        days.push(parsedDay);
      }
    });
    if (days.length > 1) {
      const sortedDates = days.map(day => day.date).sort();
      const firstDate = new Date(`${sortedDates[0]}T00:00:00.000Z`).getTime();
      const lastDate = new Date(`${sortedDates.at(-1)}T00:00:00.000Z`).getTime();
      const inclusiveRangeDays = (lastDate - firstDate) / 86_400_000 + 1;
      if (inclusiveRangeDays > MENU_IMPORT_MAX_DAYS) {
        addError(context, 'out_of_range', 'days', `Menu date range must not exceed ${MENU_IMPORT_MAX_DAYS} days`);
      }
    }
  }

  if (!hasValidFormat || !hasValidVersion || menuName === null || !hasValidDaysArray) {
    return null;
  }
  return {
    format: MENU_IMPORT_FORMAT,
    version: MENU_IMPORT_VERSION,
    menu_name: menuName,
    days,
  };
};

export function parseMenuImportJson(rawText: string): MenuImportParseResult {
  if (rawText.length > MENU_IMPORT_MAX_TEXT_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          code: 'text_too_long',
          path: '$',
          message: `JSON text must not exceed ${MENU_IMPORT_MAX_TEXT_LENGTH} characters`,
        },
      ],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      errors: [{ code: 'invalid_json', path: '$', message: 'Invalid JSON syntax' }],
    };
  }

  const context: ValidationContext = {
    errors: [],
    totalIngredientCount: 0,
    uniqueIngredientKeys: new Set<string>(),
  };
  const document = parseDocument(value, context);
  if (context.totalIngredientCount > MENU_IMPORT_MAX_TOTAL_INGREDIENTS) {
    addError(
      context,
      'too_many_ingredients',
      'days',
      `Menu contains more than ${MENU_IMPORT_MAX_TOTAL_INGREDIENTS} ingredients`,
    );
  }
  if (context.uniqueIngredientKeys.size > MENU_IMPORT_MAX_UNIQUE_INGREDIENTS) {
    addError(
      context,
      'too_many_unique_ingredients',
      'days',
      `Menu contains more than ${MENU_IMPORT_MAX_UNIQUE_INGREDIENTS} unique ingredients`,
    );
  }

  if (document === null || context.errors.length > 0) {
    return { ok: false, errors: context.errors };
  }
  return { ok: true, value: document };
}
