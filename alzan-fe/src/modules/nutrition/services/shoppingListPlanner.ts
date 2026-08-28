import { addDays, format, getISODay, parseISO, subDays } from 'date-fns';

import type { IngredientsCategory, MealItem, MealType } from '../../../types/requests.types';

export type ShoppingListStartDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ShoppingListDateRange = {
  startDate: string;
  endDate: string;
};

export type ShoppingIngredientInput = Pick<MealItem, 'name' | 'quantity_g' | 'source' | 'source_ref'>;

export type ShoppingListIngredient = {
  key: string;
  name: string;
  quantity_g: number;
  category: IngredientsCategory | null;
  purchase_quantity_g?: number;
};

export type ShoppingListIngredientFilter = 'all' | 'pending' | 'purchased';

export type ShoppingPurchaseAdjustment = 'exact' | 'round_500g' | 'round_1kg' | 'custom';

export type ShoppingListCategoryGroup = {
  category: IngredientsCategory;
  ingredients: ShoppingListIngredient[];
};

export type ShoppingListMode = 'upcoming' | 'cycle' | 'custom';

export type ShoppingMealType = Extract<MealType, 'breakfast' | 'almuerzo' | 'lunch' | 'merienda' | 'dinner' | 'snack'>;

export type ShoppingMealTimes = Partial<Record<ShoppingMealType, string>>;

export type ShoppingListRequest = {
  mode: ShoppingListMode;
  selectedDate: string;
  customStartDate?: string;
  customEndDate?: string;
  now?: Date;
  timezone?: string;
  mealTimes?: ShoppingMealTimes;
  showPast?: boolean;
};

export type ShoppingMealLogState = 'planned' | 'pending' | 'performed' | 'skipped' | 'extra' | 'past';

export type ShoppingMealLogInput = {
  id: string;
  date?: string;
  meal_type?: ShoppingMealType;
  adherence_status: string | null;
  source?: string | null;
  origin?: string | null;
};

export const DEFAULT_SHOPPING_LIST_START_DAY: ShoppingListStartDay = 1;

export const DEFAULT_SHOPPING_MEAL_TIMES: Record<Exclude<ShoppingMealType, 'snack'>, string> = {
  breakfast: '08:00',
  almuerzo: '11:00',
  lunch: '14:00',
  merienda: '17:30',
  dinner: '21:00',
};

const COMPLETED_MEAL_STATUSES = new Set(['done_as_planned', 'done_with_changes']);

const isImportedMenuPlan = (log: ShoppingMealLogInput): boolean =>
  log.source === 'menu_import_v1' && log.origin === 'imported';

export const SHOPPING_LIST_CATEGORY_ORDER: IngredientsCategory[] = [
  'proteina_animal',
  'proteina_vegetal',
  'cereal',
  'tuberculo',
  'legumbre',
  'verdura',
  'fruta',
  'lacteo',
  'grasa',
  'fruto_seco',
  'semilla',
  'bebida',
  'condimento',
  'dulce',
  'precocinado',
  'snack',
  'otro',
];

export const normalizeShoppingListStartDay = (startDay: number | null | undefined): ShoppingListStartDay =>
  typeof startDay === 'number' && Number.isInteger(startDay) && startDay >= 1 && startDay <= 7
    ? (startDay as ShoppingListStartDay)
    : DEFAULT_SHOPPING_LIST_START_DAY;

export const getShoppingCycleRange = (selectedDate: Date | string, startDay: number): ShoppingListDateRange => {
  const date = typeof selectedDate === 'string' ? parseISO(selectedDate) : selectedDate;
  if (Number.isNaN(date.getTime())) throw new Error('Shopping list selected date must be valid');
  const normalizedStartDay = normalizeShoppingListStartDay(startDay);
  const daysSinceCycleStart = (getISODay(date) - normalizedStartDay + 7) % 7;
  const start = subDays(date, daysSinceCycleStart);
  const end = addDays(start, 6);

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
  };
};

export const getShoppingCustomRange = (customStartDate: string, customEndDate: string): ShoppingListDateRange => {
  const start = parseISO(customStartDate);
  const end = parseISO(customEndDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Shopping list dates must be valid');
  }
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (dayCount < 1) throw new Error('Shopping list start date cannot be after end date');
  if (dayCount > 30) throw new Error('Shopping list custom range cannot exceed 30 days');

  return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') };
};

export const getShoppingRange = (request: ShoppingListRequest, startDay: number): ShoppingListDateRange => {
  if (request.mode === 'custom') {
    if (!request.customStartDate || !request.customEndDate) {
      throw new Error('Shopping list custom range requires start and end dates');
    }
    return getShoppingCustomRange(request.customStartDate, request.customEndDate);
  }

  return getShoppingCycleRange(request.selectedDate, startDay);
};

export const getShoppingMealTime = (
  mealType: ShoppingMealType | undefined,
  mealTimes: ShoppingMealTimes = {},
): string | null => {
  if (!mealType) return null;
  if (mealType === 'snack') return mealTimes.snack || null;
  return mealTimes[mealType] || DEFAULT_SHOPPING_MEAL_TIMES[mealType] || null;
};

const getLocalDateTimeParts = (date: Date, timezone: string): { date: string; minutes: number } => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  }
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
};

const parseShoppingTimeMinutes = (time: string | null): number | null => {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : null;
};

export const isShoppingMealPast = (log: ShoppingMealLogInput, request: ShoppingListRequest): boolean => {
  if (!log.date) return false;
  const timezone = request.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const localNow = getLocalDateTimeParts(request.now || new Date(), timezone);
  if (log.date < localNow.date) return true;
  if (log.date > localNow.date) return false;

  const mealMinutes = parseShoppingTimeMinutes(getShoppingMealTime(log.meal_type, request.mealTimes));
  return mealMinutes !== null && localNow.minutes >= mealMinutes;
};

export const getShoppingMealState = (log: ShoppingMealLogInput, request: ShoppingListRequest): ShoppingMealLogState => {
  if (log.adherence_status === 'skipped') return 'skipped';
  if (log.adherence_status === 'extra_meal') return 'extra';

  // Menu imports historically use done_as_planned for every generated row.
  // For the shopping list, an imported row is still planned until its
  // scheduled date/time has passed. Actual user-recorded meals retain their
  // completed status and continue to be excluded from "upcoming".
  if (request.mode === 'upcoming' && isImportedMenuPlan(log) && !isShoppingMealPast(log, request)) {
    return 'pending';
  }

  if (COMPLETED_MEAL_STATUSES.has(log.adherence_status || '')) return 'performed';
  if (request.mode === 'upcoming' && isShoppingMealPast(log, request)) return 'past';
  return request.mode === 'upcoming' ? 'pending' : 'planned';
};

export const planShoppingMealLogs = (
  logs: ShoppingMealLogInput[],
  request: ShoppingListRequest,
): ShoppingMealLogInput[] =>
  logs.filter(log => {
    const state = getShoppingMealState(log, request);
    if (state === 'skipped') return false;
    if (request.mode === 'upcoming' && !request.showPast) return state === 'pending';
    return true;
  });

export const getActiveShoppingMealLogIds = (logs: ShoppingMealLogInput[]): string[] =>
  logs.filter(log => log.adherence_status !== 'skipped').map(log => log.id);

const getIngredientKey = (item: ShoppingIngredientInput): string | null => {
  const sourceRef = item.source_ref?.trim();
  if (sourceRef) return `id:${sourceRef}`;

  const normalizedName = item.name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalizedName ? `name:${normalizedName}` : null;
};

export const aggregateShoppingIngredients = (
  items: ShoppingIngredientInput[],
  localizedNamesById: ReadonlyMap<string, string> = new Map(),
  categoriesById: ReadonlyMap<string, IngredientsCategory> = new Map(),
): ShoppingListIngredient[] => {
  const aggregated = new Map<string, ShoppingListIngredient>();

  for (const item of items) {
    const key = getIngredientKey(item);
    if (!key) continue;

    const sourceRef = item.source_ref?.trim();
    const name = sourceRef ? localizedNamesById.get(sourceRef) || item.name.trim() : item.name.trim();
    const existing = aggregated.get(key);

    if (existing) {
      aggregated.set(key, {
        ...existing,
        quantity_g: existing.quantity_g + (Number(item.quantity_g) || 0),
      });
    } else {
      aggregated.set(key, {
        key,
        name,
        quantity_g: Number(item.quantity_g) || 0,
        category: sourceRef ? categoriesById.get(sourceRef) || null : null,
      });
    }
  }

  return Array.from(aggregated.values())
    .map(item => ({
      ...item,
      quantity_g: Math.round(item.quantity_g * 100) / 100,
      purchase_quantity_g: Math.round(item.quantity_g * 100) / 100,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const getShoppingPurchaseQuantity = (ingredient: ShoppingListIngredient): number =>
  typeof ingredient.purchase_quantity_g === 'number' && Number.isFinite(ingredient.purchase_quantity_g)
    ? Math.max(0, ingredient.purchase_quantity_g)
    : ingredient.quantity_g;

export const roundShoppingPurchaseQuantity = (quantityGrams: number, increment: 500 | 1000): number =>
  Math.max(increment, Math.ceil(Math.max(0, quantityGrams) / increment) * increment);

export const setShoppingPurchaseQuantity = (
  ingredients: ShoppingListIngredient[],
  key: string,
  quantityGrams: number,
): ShoppingListIngredient[] => {
  if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) return ingredients;
  return ingredients.map(ingredient =>
    ingredient.key === key ? { ...ingredient, purchase_quantity_g: Math.round(quantityGrams * 100) / 100 } : ingredient,
  );
};

export const adjustShoppingPurchaseQuantity = (
  ingredient: ShoppingListIngredient,
  adjustment: ShoppingPurchaseAdjustment,
  customQuantityGrams?: number,
): number => {
  if (adjustment === 'round_500g') return roundShoppingPurchaseQuantity(ingredient.quantity_g, 500);
  if (adjustment === 'round_1kg') return roundShoppingPurchaseQuantity(ingredient.quantity_g, 1000);
  if (adjustment === 'custom' && typeof customQuantityGrams === 'number' && customQuantityGrams > 0) {
    return Math.round(customQuantityGrams * 100) / 100;
  }
  return ingredient.quantity_g;
};

export const filterShoppingIngredients = (
  ingredients: ShoppingListIngredient[],
  completedKeys: ReadonlySet<string>,
  filter: ShoppingListIngredientFilter,
): ShoppingListIngredient[] => {
  if (filter === 'pending') return ingredients.filter(ingredient => !completedKeys.has(ingredient.key));
  if (filter === 'purchased') return ingredients.filter(ingredient => completedKeys.has(ingredient.key));
  return ingredients;
};

export const groupShoppingIngredientsByCategory = (
  ingredients: ShoppingListIngredient[],
): ShoppingListCategoryGroup[] => {
  const grouped = new Map<IngredientsCategory, ShoppingListIngredient[]>();

  for (const ingredient of ingredients) {
    const category = ingredient.category || 'otro';
    const categoryIngredients = grouped.get(category) || [];
    categoryIngredients.push(ingredient);
    grouped.set(category, categoryIngredients);
  }

  return SHOPPING_LIST_CATEGORY_ORDER.flatMap(category => {
    const categoryIngredients = grouped.get(category);
    if (!categoryIngredients?.length) return [];

    return [
      {
        category,
        ingredients: [...categoryIngredients].sort((left, right) => left.name.localeCompare(right.name)),
      },
    ];
  });
};

export const formatShoppingQuantity = (quantityGrams: number): string => {
  const roundedGrams = Math.round(Math.max(0, quantityGrams) * 100) / 100;
  if (roundedGrams >= 1000) {
    const kilograms = Math.round((roundedGrams / 1000) * 100) / 100;
    return `${kilograms} kg`;
  }

  return `${roundedGrams} g`;
};

export const formatShoppingListForExport = (ingredients: ShoppingListIngredient[]): string =>
  ingredients
    .map(ingredient => `${ingredient.name} - ${formatShoppingQuantity(getShoppingPurchaseQuantity(ingredient))}`)
    .join('\n');
