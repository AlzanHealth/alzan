// src/services/nutritionApi.ts
// Módulo para interactuar con la API de Open Food Facts v2.
// Documentación: https://openfoodfacts.github.io/api-documentation/

import { CONFIG } from '../constants/environment';
import { supabase } from '../lib/supabaseClient';
import { isProductNotFoundHttpError, NutritionApiHttpError } from './nutritionApiHttp';

const BASE_URL = CONFIG.nutritionApiBaseUrl;
const DEFAULT_USER_AGENT_EMAIL = 'invitado@alzan.app';
const DEFAULT_HEADERS = {
  'User-Agent': `AlzanHealthApp/1.0 (${DEFAULT_USER_AGENT_EMAIL})`,
  'Content-Type': 'application/json',
};
const API_TIMEOUT_MS = 60000; // 1 minute
const PRODUCT_DETAILS_FIELDS = [
  'code',
  'product_name',
  'product_name_es',
  'product_name_en',
  'brands',
  'quantity',
  'image_front_small_url',
  'serving_size',
  'nutriments',
].join(',');

// Tipos base para la aplicación
export type Macros = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
};

export type FoodNutrition = {
  id: string;
  name: string;
  brand?: string | null;
  quantity?: string | null;
  per_100g: Macros;
  per_serving?: Macros | null;
  serving_size?: string | null;
  image_url?: string | null;
};

export type MealIngredientInput = {
  name: string;
  grams: number;
  foodId?: string;
};

export type MealNutrition = {
  total: Macros;
  ingredients: Array<{
    input: MealIngredientInput;
    food: FoodNutrition;
    macros: Macros;
  }>;
};

export type IngredientResult = {
  name: string;
  grams: number;
  kcalPer100g: number;
  kcal: number;
};

// Open Food Facts Types
export interface OFFNutriments {
  'energy-kcal_100g'?: number | string;
  'energy-kcal'?: number | string;
  'energy-kcal_serving'?: number | string;
  proteins_100g?: number | string;
  proteins?: number | string;
  proteins_serving?: number | string;
  carbohydrates_100g?: number | string;
  carbohydrates?: number | string;
  carbohydrates_serving?: number | string;
  fat_100g?: number | string;
  fat?: number | string;
  fat_serving?: number | string;
  [key: string]: unknown;
}

export interface OFFProduct {
  code?: string;
  id?: string;
  product_name?: string;
  product_name_es?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  image_url?: string;
  image_front_small_url?: string;
  serving_size?: string;
  nutriments?: OFFNutriments;
}

export interface OFFSearchResponse {
  products: OFFProduct[];
  count: number;
  page: number;
  page_size: number;
}

export interface OFFProductResponse {
  product: OFFProduct;
  status: number;
  code: string;
}

// ------------------------------------------------------------------
// Internal Helpers
// ------------------------------------------------------------------

let cachedHeaders: Record<string, string> = DEFAULT_HEADERS;
let headersWarmupPromise: Promise<void> | null = null;

function setCachedHeaders(email?: string): void {
  cachedHeaders = {
    'User-Agent': `AlzanHealthApp/1.0 (${email || DEFAULT_USER_AGENT_EMAIL})`,
    'Content-Type': 'application/json',
  };
}

export function warmNutritionApiHeaders(): void {
  if (headersWarmupPromise) {
    return;
  }

  headersWarmupPromise = supabase.auth
    .getSession()
    .then(({ data }) => {
      setCachedHeaders(data.session?.user?.email);
    })
    .catch(error => {
      console.error('[nutritionApi] Header warmup error:', error);
      setCachedHeaders();
    })
    .finally(() => {
      headersWarmupPromise = null;
    });
}

function getHeaders(): Record<string, string> {
  warmNutritionApiHeaders();
  return cachedHeaders;
}

async function apiFetch<T>(url: string): Promise<T> {
  const headers = getHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  console.info('[nutritionApi] request:start', { url });

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    console.info('[nutritionApi] request:response', {
      url,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get('content-type'),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[nutritionApi] request:http-error', {
        url,
        status: res.status,
        body: text.slice(0, 500),
      });
      throw new NutritionApiHttpError({
        status: res.status,
        url,
        body: text,
      });
    }

    const data = (await res.json()) as T;
    console.info('[nutritionApi] request:success', {
      url,
      responseKeys: data && typeof data === 'object' ? Object.keys(data) : [],
    });
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[nutritionApi] Request timeout after ${API_TIMEOUT_MS}ms: ${url}`);
      throw new Error('Tiempo de espera agotado en la API nutricional');
    }
    console.error('[nutritionApi] request:failed', {
      url,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ------------------------------------------------------------------
// Core Logic (Requested by User)
// ------------------------------------------------------------------

/**
 * Busca un ingrediente por nombre y calcula sus calorías para un peso específico.
 * Endpoint: /api/v2/search
 */
export async function getCaloriesForIngredient(name: string, grams: number): Promise<IngredientResult> {
  // Construir parámetros exactamente como se solicitó
  // search_terms: nombre
  // page_size: 1 (solo el primer resultado)
  // fields: code,product_name,nutriments
  const params = new URLSearchParams({
    search_terms: name,
    page_size: '1',
    fields: 'code,product_name,nutriments',
  });

  const url = `${BASE_URL}/api/v2/search?${params.toString()}`;

  // Obtener respuesta
  const data = await apiFetch<OFFSearchResponse>(url);

  if (!data.products || data.products.length === 0) {
    throw new Error(`Producto no encontrado: ${name}`);
  }

  const product = data.products[0];
  const nutriments = product.nutriments || {};

  // Extraer kcal_100g
  // OFF devuelve energy-kcal_100g
  const kcalPer100g = Number(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? 0);

  // Calcular total: (kcal_100g / 100) * grams
  const kcalTotal = (kcalPer100g / 100) * grams;

  return {
    name: product.product_name || name,
    grams,
    kcalPer100g,
    kcal: Math.round(kcalTotal),
  };
}

// ------------------------------------------------------------------
// Legacy / Compatibility Functions (Refactored to use V2 where possible)
// ------------------------------------------------------------------

export type FoodSearchResult = {
  id: string;
  name: string;
  brand?: string | null;
  quantity?: string | null;
  image_url?: string | null;
  calories: number; // For compatibility
};

export type SearchFoodsResponse = {
  query: string;
  results: FoodSearchResult[];
};

export type FoodItem = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  servingSize: number;
  servingUnit: string;
};

/**
 * Busca alimentos por nombre usando la API V2.
 * Devuelve lista con info básica y calorías.
 */
export async function searchFoodsByName(query: string, limit = 20): Promise<SearchFoodsResponse> {
  if (!query.trim()) return { query, results: [] };

  const params = new URLSearchParams({
    search_terms: query,
    page_size: String(limit),
    fields: 'code,product_name,brands,quantity,image_front_small_url,nutriments',
  });

  const url = `${BASE_URL}/api/v2/search?${params.toString()}`;
  const data = await apiFetch<OFFSearchResponse>(url);
  const products = data.products || [];

  const results: FoodSearchResult[] = products.map(p => ({
    id: String(p.code),
    name: p.product_name || 'Sin nombre',
    brand: p.brands || null,
    quantity: p.quantity || null,
    image_url: p.image_front_small_url || null,
    calories: Number(p.nutriments?.['energy-kcal_100g'] || 0),
  }));

  return { query, results };
}

// Alias for compatibility
export async function searchFoods(query: string): Promise<FoodItem[]> {
  // Adaptar respuesta al formato FoodItem anterior si es necesario,
  // pero idealmente deberíamos migrar a usar searchFoodsByName.
  const { results } = await searchFoodsByName(query);
  return results.map(r => ({
    id: r.id,
    name: r.name,
    calories: r.calories,
    protein: 0, // Search list doesn't usually fetch full macros efficiently unless asked
    carbs: 0,
    fats: 0,
    servingSize: 100,
    servingUnit: 'g',
  }));
}

export async function getFoodNutritionById(foodId: string): Promise<FoodNutrition | null> {
  if (!foodId) return null;

  const params = new URLSearchParams({
    fields: PRODUCT_DETAILS_FIELDS,
  });
  const url = `${BASE_URL}/api/v2/product/${encodeURIComponent(foodId)}?${params.toString()}`;
  console.info('[nutritionApi] product:lookup', { foodId, url });
  let data: OFFProductResponse;
  try {
    data = await apiFetch<OFFProductResponse>(url);
  } catch (error) {
    if (isProductNotFoundHttpError(error)) {
      console.warn('[nutritionApi] product:not-found', {
        foodId,
        status: error.status,
        responseBody: error.body.slice(0, 500),
      });
      return null;
    }
    throw error;
  }

  console.info('[nutritionApi] product:result', {
    foodId,
    apiCode: data.code,
    apiStatus: data.status,
    hasProduct: Boolean(data.product),
  });

  if (!data.product) return null;

  return mapOFFProductToFoodNutrition(data.product);
}

export async function getFoodNutritionByName(name: string): Promise<FoodNutrition | null> {
  const search = await searchFoodsByName(name, 1);
  if (search.results.length === 0) return null;
  return getFoodNutritionById(search.results[0].id);
}

// ------------------------------------------------------------------
// Internal Mapper
// ------------------------------------------------------------------

function mapOFFProductToFoodNutrition(raw: OFFProduct, idOverride?: string): FoodNutrition {
  const id = String(raw.id || raw.code || idOverride || '');
  const name = raw.product_name || raw.product_name_es || raw.product_name_en || 'Alimento desconocido';
  const brand = raw.brands || null;
  const quantity = raw.quantity || null;
  const image_url = raw.image_url || raw.image_front_small_url || null;
  const serving_size = raw.serving_size || null;

  const n = raw.nutriments || {};

  const kcal = Number(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0);
  const protein_g = Number(n.proteins_100g ?? n.proteins ?? 0);
  const carbs_g = Number(n.carbohydrates_100g ?? n.carbohydrates ?? 0);
  const fats_g = Number(n.fat_100g ?? n.fat ?? 0);

  const per_100g: Macros = { kcal, protein_g, carbs_g, fats_g };

  let per_serving: Macros | null = null;
  if (n['energy-kcal_serving'] !== undefined) {
    per_serving = {
      kcal: Number(n['energy-kcal_serving'] || 0),
      protein_g: Number(n.proteins_serving || 0),
      carbs_g: Number(n.carbohydrates_serving || 0),
      fats_g: Number(n.fat_serving || 0),
    };
  }

  return {
    id,
    name,
    brand,
    quantity,
    per_100g,
    per_serving,
    serving_size,
    image_url,
  };
}

// ------------------------------------------------------------------
// Legacy / Helper Functions (Restored for compatibility)
// ------------------------------------------------------------------

export async function getIngredientNutrition(ingredient: MealIngredientInput): Promise<{
  input: MealIngredientInput;
  food: FoodNutrition;
  macros: Macros;
} | null> {
  let food: FoodNutrition | null = null;
  if (ingredient.foodId) {
    food = await getFoodNutritionById(ingredient.foodId);
  } else {
    food = await getFoodNutritionByName(ingredient.name);
  }

  if (!food) return null;

  const factor = ingredient.grams / 100;
  const macros: Macros = {
    kcal: Math.round(food.per_100g.kcal * factor),
    protein_g: Number((food.per_100g.protein_g * factor).toFixed(1)),
    carbs_g: Number((food.per_100g.carbs_g * factor).toFixed(1)),
    fats_g: Number((food.per_100g.fats_g * factor).toFixed(1)),
  };

  return { input: ingredient, food, macros };
}

export async function getMealNutritionFromIngredients(ingredients: MealIngredientInput[]): Promise<MealNutrition> {
  const details: MealNutrition['ingredients'] = [];
  const total: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0 };

  for (const ing of ingredients) {
    const item = await getIngredientNutrition(ing);
    if (!item) continue;

    details.push(item);
    total.kcal += item.macros.kcal;
    total.protein_g += item.macros.protein_g;
    total.carbs_g += item.macros.carbs_g;
    total.fats_g += item.macros.fats_g;
  }

  // Redondear totales
  total.kcal = Math.round(total.kcal);
  total.protein_g = Number(total.protein_g.toFixed(1));
  total.carbs_g = Number(total.carbs_g.toFixed(1));
  total.fats_g = Number(total.fats_g.toFixed(1));

  return { total, ingredients: details };
}

export async function getMealNutrition(
  mealName: string,
  ingredientInputs?: MealIngredientInput[],
): Promise<MealNutrition | null> {
  if (ingredientInputs && ingredientInputs.length > 0) {
    return getMealNutritionFromIngredients(ingredientInputs);
  }

  // fallback a buscar por nombre
  const food = await getFoodNutritionByName(mealName);
  if (!food) return null;

  // Asumir 100g si no tenemos info mejor (o usas serving si quieres)
  const macros = food.per_100g;

  return {
    total: macros,
    ingredients: [
      {
        input: { name: mealName, grams: 100 },
        food,
        macros,
      },
    ],
  };
}
