import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NutritionScreenNavigationProp, NutritionStackParamList } from '../../types/navigation.types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { X, Search, ScanBarcode, Plus, Trash2, ChevronLeft, Check, Info, Bookmark } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNutritionStyles } from '../../hooks/useNutritionStyles';

import { IngredientSearchPanel } from '../../modules/nutrition/components/IngredientSearchPanel';
import { PersonalFoodTrends } from '../../modules/nutrition/components/PersonalFoodTrends';
import { MacrosSummaryCard } from '../../modules/nutrition/components/MacrosSummaryCard';
import { FoodScanner } from '../../modules/nutrition/components/FoodScanner';
import {
  calculateMacros,
  calculateTotalMacros,
  Macros,
  MealComponent,
} from '../../modules/nutrition/types/ingredients';
import { MEAL_TYPE_LABELS, MIN_INGREDIENT_QUANTITY_G } from '../../modules/nutrition/constants';
import { useUnitConversion } from '../../hooks/useUnitConversion';

import { useSaveMealWithIngredients, useMealItems } from '../../modules/nutrition/hooks/useNutritionData';
import { DailyMealItem } from '../../modules/nutrition/types';
import { format } from 'date-fns';
import { getCurrentAppLocale, getLocalizedIngredientNotes } from '../../services/localization';
import { getRecipeIngredients } from '../../modules/nutrition/services/recipeService';
import {
  FOOD_QUALITY_SCORE_VERSION,
  calculateFoodQualityScore,
  toFoodCategory,
} from '../../modules/nutrition/services/foodQualityScore';
import {
  logRecipeUsage,
  publishRecipe,
  RecipeSearchScope,
  refreshRecipeAggregates,
  searchMealByName,
} from '../../modules/nutrition/services/nutritionSearchService';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { fetchByBarcode } from '../../modules/nutrition/services/nutritionSearchService';
import { formatLocalizedDate, getLocaleTag } from '../../i18n/dateLocale';
import { supabase } from '../../lib/supabaseClient';
import { IngredientsCategory, MealItemsSource } from '../../types/requests.types';
import { usePreferences } from '../../hooks/settings/usePreferences';

type RecipeIngredientItem = Awaited<ReturnType<typeof getRecipeIngredients>>[number];

type InputMode = 'search' | 'scan' | 'manual' | 'photo';
type MealSearchFilter = 'all' | 'recipe' | 'precooked';
const MEAL_RECIPE_PAGE_SIZE = 5;
const INGREDIENT_AMOUNT_DECIMALS = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const roundIngredientAmount = (amount: number): number => {
  if (amount <= 0) return 0;
  const rounded = Math.round(amount * 10 ** INGREDIENT_AMOUNT_DECIMALS) / 10 ** INGREDIENT_AMOUNT_DECIMALS;
  // A positive amount that rounds below the storable minimum (e.g. 0.02 g) is bumped
  // up so the form shows the same value that will be saved to meal_items.
  if (rounded < MIN_INGREDIENT_QUANTITY_G) {
    return MIN_INGREDIENT_QUANTITY_G;
  }
  return rounded;
};

const parseIngredientAmountInput = (input: string): number | null => {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return roundIngredientAmount(amount);
};

const sanitizeIngredientAmountInput = (input: string): string => {
  const normalized = input.replace(',', '.').replace(/[^\d.]/g, '');
  const [integerPart, ...decimalParts] = normalized.split('.');
  if (decimalParts.length === 0) return integerPart;
  return `${integerPart}.${decimalParts.join('')}`;
};

const formatIngredientAmount = (amount: number): string => {
  const rounded = roundIngredientAmount(amount);
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(INGREDIENT_AMOUNT_DECIMALS);
};

const isIngredientAmountOverLimit = (input: string): boolean => {
  const amount = parseIngredientAmountInput(input);
  return amount != null && amount > 1000;
};

const isUuid = (value: string | null | undefined): value is string => Boolean(value && UUID_PATTERN.test(value));

const parseManualMacroInput = (input: string): number | null => {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

type ManualIngredientNutritionValidationReason =
  | 'negative'
  | 'macro_over_100'
  | 'macro_sum_over_limit'
  | 'kcal_over_limit'
  | 'zero_kcal_with_macros'
  | 'energy_mismatch';

type ManualIngredientNutritionInput = {
  kcal_100: number;
  protein_g_100: number;
  carbs_g_100: number;
  fat_g_100: number;
};

type ManualIngredientNutritionValidation = {
  isValid: boolean;
  reason?: ManualIngredientNutritionValidationReason;
};

const validateManualIngredientNutrition = ({
  kcal_100,
  protein_g_100,
  carbs_g_100,
  fat_g_100,
}: ManualIngredientNutritionInput): ManualIngredientNutritionValidation => {
  const values = [kcal_100, protein_g_100, carbs_g_100, fat_g_100];
  if (values.some(value => !Number.isFinite(value) || value < 0)) {
    return { isValid: false, reason: 'negative' };
  }

  if (protein_g_100 > 100 || carbs_g_100 > 100 || fat_g_100 > 100) {
    return { isValid: false, reason: 'macro_over_100' };
  }

  if (protein_g_100 + carbs_g_100 + fat_g_100 > 115) {
    return { isValid: false, reason: 'macro_sum_over_limit' };
  }

  if (kcal_100 > 950) {
    return { isValid: false, reason: 'kcal_over_limit' };
  }

  const estimatedKcal = protein_g_100 * 4 + carbs_g_100 * 4 + fat_g_100 * 9;
  if (kcal_100 === 0 && estimatedKcal > 0) {
    return { isValid: false, reason: 'zero_kcal_with_macros' };
  }

  if (estimatedKcal >= 5 && (kcal_100 < estimatedKcal * 0.35 || kcal_100 > estimatedKcal * 2.5)) {
    return { isValid: false, reason: 'energy_mismatch' };
  }

  return { isValid: true };
};

interface EditableRecipeSignature {
  name: string;
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    unit: string;
  }>;
}

export const MealLogFormScreen = () => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const languageCode = getCurrentAppLocale();
  const navigation = useNavigation<NutritionScreenNavigationProp>();
  const route = useRoute<RouteProp<NutritionStackParamList, 'MealLogForm'>>();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useNutritionStyles();
  const params = route.params as {
    date: string;
    mealItem?: DailyMealItem;
    isExtra?: boolean;
    presetRecipeId?: string;
    presetRecipeName?: string;
  };
  const { convertEnergyToUi, parseEnergyToKcal, units } = useUnitConversion();
  const mealItem = params.mealItem;
  const isEdit = !!mealItem?.log;
  const date = params.date || format(new Date(), 'yyyy-MM-dd');
  const defaultRecipeVisibility =
    preferences?.nutrition_prefs?.default_recipe_visibility === 'public' ? 'public' : 'private';
  const recipeSearchScope: RecipeSearchScope = preferences?.nutrition_prefs?.recipe_search_scope || 'source';

  // Dynamic bottom padding calculation
  // MacrosSummaryCard height estimate: ~120px content + padding
  const footerHeight = 140;
  const insets = useSafeAreaInsets();
  let tabBarHeight = 50;
  try {
    const tbHeight = useBottomTabBarHeight();
    tabBarHeight = tbHeight;
  } catch (_error) {
    tabBarHeight = 50 + insets.bottom;
  }
  const contentBottomPadding = tabBarHeight + footerHeight + 20;

  // API Hooks
  const saveMeal = useSaveMealWithIngredients();
  const { data: dbIngredients } = useMealItems(mealItem?.log?.id);

  // Initial State
  const [name, setName] = useState(mealItem?.displayName || '');
  const [mealType] = useState(mealItem?.mealType || 'snack');
  const [ingredients, setIngredients] = useState<MealComponent[]>([]);

  // Manual Macros (used if no ingredients)
  const [manualMacros, setManualMacros] = useState<Macros>({
    kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fats_g: 0,
  });

  // UI State
  const [inputMode, setInputMode] = useState<InputMode>('search');
  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isBarcodeLookupPending, setIsBarcodeLookupPending] = useState(false);
  const [editingSavedRecipeId, setEditingSavedRecipeId] = useState<string | null>(null);
  const [editingSavedRecipeUpdatedAt, setEditingSavedRecipeUpdatedAt] = useState<string | null>(null);
  const [editingRecipeSignature, setEditingRecipeSignature] = useState<string | null>(null);
  const lastRecipeAggregateRefreshAtRef = useRef<number>(0);

  // Manual Ingredient Form State
  const [manualIngName, setManualIngName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  // Last amount the user added in this session, for the quick-amount chips.
  const [lastIngredientAmount, setLastIngredientAmount] = useState<number | null>(null);
  const [manualPer100g, setManualPer100g] = useState<{
    kcal_100: number;
    protein_g_100: number;
    carbs_g_100: number;
    fat_g_100: number;
  }>({
    kcal_100: 0,
    protein_g_100: 0,
    carbs_g_100: 0,
    fat_g_100: 0,
  });
  const [manualMacroInputs, setManualMacroInputs] = useState({
    kcal_100: '',
    protein_g_100: '',
    carbs_g_100: '',
    fat_g_100: '',
  });
  const manualIngredientNutritionValidation = validateManualIngredientNutrition(manualPer100g);
  const isManualIngredientFieldsComplete =
    manualIngName.trim().length > 0 &&
    parseIngredientAmountInput(amountInput) != null &&
    !isIngredientAmountOverLimit(amountInput) &&
    parseManualMacroInput(manualMacroInputs.kcal_100) != null &&
    parseManualMacroInput(manualMacroInputs.protein_g_100) != null &&
    parseManualMacroInput(manualMacroInputs.carbs_g_100) != null &&
    parseManualMacroInput(manualMacroInputs.fat_g_100) != null;
  const shouldShowManualIngredientNutritionWarning =
    isManualIngredientFieldsComplete && !manualIngredientNutritionValidation.isValid;
  const isManualIngredientFormComplete =
    isManualIngredientFieldsComplete && manualIngredientNutritionValidation.isValid;

  // Inline Editing State
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [editAmountInput, setEditAmountInput] = useState('');

  // If selected food from search/scan
  const [selectedFood, setSelectedFood] = useState<MealComponent | null>(null);

  // --- Effects ---

  // Load existing ingredients or manual macros
  useEffect(() => {
    if (dbIngredients && dbIngredients.length > 0) {
      const mapped: MealComponent[] = dbIngredients.map(item => ({
        id: item.id,
        name: item.name,
        amount_g: roundIngredientAmount(item.quantity_g || 0),
        source: item.source as MealComponent['source'],
        external_id: item.source_ref || undefined,
        macros_per_100g: undefined, // Removed property
        kcal_100: item.per_100g_kcal || 0,
        protein_g_100: item.per_100g_protein_g || 0,
        carbs_g_100: item.per_100g_carbs_g || 0,
        fat_g_100: item.per_100g_fats_g || 0,
        calculated_macros: {
          kcal: item.kcal || 0,
          protein_g: item.protein_g || 0,
          carbs_g: item.carbs_g || 0,
          fats_g: item.fats_g || 0,
        },
      }));
      setIngredients(mapped);
    } else if (isEdit && mealItem?.log && mealItem.log.data_quality === 'manual') {
      setManualMacros({
        kcal: mealItem.log.kcal || 0,
        protein_g: mealItem.log.protein_g || 0,
        carbs_g: mealItem.log.carbs_g || 0,
        fats_g: mealItem.log.fats_g || 0,
      });
    }
  }, [dbIngredients, isEdit, mealItem]);

  useEffect(() => {
    if (mealItem?.log?.name) {
      setName(mealItem.log.name);
    }
  }, [mealItem]);

  // Recipe matching state
  const [isSearchingRecipe, setIsSearchingRecipe] = useState(false);
  const [searchMessage, setSearchMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [mealSearchResults, setMealSearchResults] = useState<MealComponent[]>([]);
  const [mealSearchFilter, setMealSearchFilter] = useState<MealSearchFilter>('recipe');
  const [mealRecipePage, setMealRecipePage] = useState(1);

  // Meal detail modal state
  const [showMealDetailModal, setShowMealDetailModal] = useState(false);
  const [selectedMealDetail, setSelectedMealDetail] = useState<MealComponent | null>(null);
  const [mealDetailLoading, setMealDetailLoading] = useState(false);
  const [mealDetailIngredients, setMealDetailIngredients] = useState<RecipeIngredientItem[]>([]);
  const [recipeDetailSourceLabel, setRecipeDetailSourceLabel] = useState<string | null>(null);
  const [isRecipeDetailSourceLoading, setIsRecipeDetailSourceLoading] = useState(false);

  const recipeSearchResults = useMemo(
    () => mealSearchResults.filter(item => item.itemType === 'recipe'),
    [mealSearchResults],
  );

  const precookedSearchResults = useMemo(
    () => mealSearchResults.filter(item => item.category === 'precocinado'),
    [mealSearchResults],
  );

  const filteredMealSearchResults = useMemo(() => {
    if (mealSearchFilter === 'recipe') return recipeSearchResults;
    if (mealSearchFilter === 'precooked') return precookedSearchResults;
    return mealSearchResults;
  }, [mealSearchFilter, mealSearchResults, precookedSearchResults, recipeSearchResults]);
  const mealRecipeTotalPages = Math.max(1, Math.ceil(recipeSearchResults.length / MEAL_RECIPE_PAGE_SIZE));
  const paginatedRecipeSearchResults = useMemo(() => {
    const safePage = Math.min(Math.max(1, mealRecipePage), mealRecipeTotalPages);
    const from = (safePage - 1) * MEAL_RECIPE_PAGE_SIZE;
    const to = from + MEAL_RECIPE_PAGE_SIZE;
    return recipeSearchResults.slice(from, to);
  }, [mealRecipePage, mealRecipeTotalPages, recipeSearchResults]);
  const showMealRecipePagination =
    recipeSearchResults.length > MEAL_RECIPE_PAGE_SIZE && (mealSearchFilter === 'recipe' || mealSearchFilter === 'all');

  const formatDetailValue = (value?: number | null): string => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
    return Number(value.toFixed(2)).toString();
  };

  const logRecipeQualityDebug = (payload: Record<string, unknown>) => {
    if (!__DEV__) return;
    console.info('[MealLogForm] Recipe quality score debug', payload);
  };

  const buildRecipeSignature = (recipeName: string, recipeIngredients: MealComponent[]): string => {
    const signature: EditableRecipeSignature = {
      name: recipeName.trim().toLowerCase(),
      ingredients: recipeIngredients.map(ingredient => ({
        ingredientId: ingredient.external_id || ingredient.id,
        quantity: roundIngredientAmount(ingredient.amount_g || 0),
        unit: 'g',
      })),
    };

    return JSON.stringify(signature);
  };

  // Only used when saving/updating user recipes.
  const buildRecipeNutritionSnapshot = (recipeIngredients: MealComponent[], recipeName: string) => {
    const totalWeight = recipeIngredients.reduce((sum, ingredient) => sum + (ingredient.amount_g || 0), 0);
    const totalMacros = calculateTotalMacros(recipeIngredients);
    const scaleTo100g = totalWeight > 0 ? 100 / totalWeight : 0;
    const qualityInput = {
      ingredients: recipeIngredients.map(ingredient => {
        const computed = ingredient.calculated_macros || calculateMacros(ingredient, ingredient.amount_g || 0);
        return {
          category: toFoodCategory(ingredient.category),
          weight_g: ingredient.amount_g || 0,
          macros: {
            energyKcal: computed.kcal,
            protein_g: computed.protein_g,
            carbs_g: computed.carbs_g,
            fat_g: computed.fats_g,
          },
        };
      }),
      totalMacros: {
        energyKcal: totalMacros.kcal,
        protein_g: totalMacros.protein_g,
        carbs_g: totalMacros.carbs_g,
        fat_g: totalMacros.fats_g,
      },
    };
    const qualityResult = calculateFoodQualityScore(qualityInput);

    logRecipeQualityDebug({
      recipeName,
      algorithm: FOOD_QUALITY_SCORE_VERSION,
      score: qualityResult.score,
      grade: qualityResult.grade,
      score01: qualityResult.score01,
      breakdown: qualityResult.breakdown,
      debug: qualityResult.debug,
    });

    return {
      kcal_100: Number((totalMacros.kcal * scaleTo100g).toFixed(2)),
      protein_g_100: Number((totalMacros.protein_g * scaleTo100g).toFixed(2)),
      carbs_g_100: Number((totalMacros.carbs_g * scaleTo100g).toFixed(2)),
      fat_g_100: Number((totalMacros.fats_g * scaleTo100g).toFixed(2)),
      quality_score: qualityResult.score01,
    };
  };

  const currentRecipeSignature = useMemo(() => buildRecipeSignature(name, ingredients), [ingredients, name]);
  const isEditingRecipe = editingSavedRecipeId !== null;
  const isIdenticalToOriginalRecipe =
    editingRecipeSignature !== null && editingRecipeSignature === currentRecipeSignature;
  const canSubmitRecipe = name.trim().length > 0 && ingredients.length > 0 && !isIdenticalToOriginalRecipe;

  // Handler to show meal detail
  const handleShowMealDetail = async (item: MealComponent, prefetchedIngredients?: RecipeIngredientItem[]) => {
    setSelectedMealDetail(item);
    setShowMealDetailModal(true);
    setMealDetailIngredients(prefetchedIngredients ?? []);
    setRecipeDetailSourceLabel(null);
    setIsRecipeDetailSourceLoading(false);

    if (item.itemType === 'recipe') {
      void loadRecipeDetailSource(item);
    }

    if (prefetchedIngredients) {
      setMealDetailLoading(false);
      return;
    }

    // If it's a recipe, fetch its ingredients
    if (item.itemType === 'recipe' && item.external_id) {
      setMealDetailLoading(true);
      try {
        const ingredients = await getRecipeIngredients(item.external_id, languageCode);
        setMealDetailIngredients(ingredients);
      } catch (error) {
        console.error('[MealLogForm] Error fetching recipe details:', error);
      } finally {
        setMealDetailLoading(false);
      }
    }
  };

  const maybeRefreshRecipeAggregates = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRecipeAggregateRefreshAtRef.current < 20_000) {
      return;
    }

    lastRecipeAggregateRefreshAtRef.current = now;
    await refreshRecipeAggregates();
  }, []);

  // Clear search results when name is cleared
  useEffect(() => {
    if (!name || name.length < 2) {
      setMealSearchResults([]);
      setSearchMessage(null);
      setMealSearchFilter('recipe');
      setMealRecipePage(1);
    }
  }, [name]);

  useEffect(() => {
    setMealRecipePage(1);
  }, [mealSearchFilter, recipeSearchResults.length]);

  // Meal Name Search - searches recipes + precooked. Shared by the explicit
  // search button and the debounced auto-search effect below.
  const performMealSearch = useCallback(
    async (query: string) => {
      setIsSearchingRecipe(true);
      setSearchMessage(null);
      setMealSearchResults([]);

      try {
        const currentUserId = await getCurrentUserId();
        const results = await searchMealByName(query, {
          locale: languageCode,
          recipeScope: recipeSearchScope,
          currentUserId,
        });

        if (results.length > 0) {
          setMealSearchResults(results);
          if (results.some(item => item.itemType === 'recipe')) {
            setMealSearchFilter('recipe');
          } else if (results.some(item => item.category === 'precocinado')) {
            setMealSearchFilter('precooked');
          } else {
            setMealSearchFilter('all');
          }
        } else {
          setSearchMessage({
            type: 'info',
            text: t('nutrition.searchNoResultsManual'),
          });
        }
      } catch (error) {
        console.error('[MealLogForm] Error in search:', error);
        setSearchMessage({ type: 'error', text: t('nutrition.searchError') });
      } finally {
        setIsSearchingRecipe(false);
      }
    },
    // getCurrentUserId is a stable component-scoped helper; intentionally omitted.
    [languageCode, recipeSearchScope, t],
  );

  // Explicit search trigger (button) - keeps the min-chars hint.
  const handleAiSearch = () => {
    if (!name || name.length < 2) {
      setSearchMessage({ type: 'info', text: t('nutrition.searchMinChars') });
      return;
    }
    void performMealSearch(name);
  };

  // Auto-search as the user types the meal name (debounced). Only while building
  // a brand-new meal from scratch, so we never override a loaded/edited recipe.
  useEffect(() => {
    if (inputMode !== 'search') return;
    if (isEdit || isEditingRecipe || ingredients.length > 0) return;

    const trimmedName = name.trim();
    if (trimmedName.length < 2) return;

    const timeoutId = setTimeout(() => {
      void performMealSearch(trimmedName);
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [inputMode, isEdit, isEditingRecipe, ingredients.length, name, performMealSearch]);

  const trackRecipeUsage = (recipeId: string, origin: 'search' | 'saved'): void => {
    void (async () => {
      try {
        await logRecipeUsage(recipeId, 'meal_log');
        await maybeRefreshRecipeAggregates();
      } catch (error) {
        console.error(`[MealLogForm] Error logging recipe usage (${origin}):`, error);
      }
    })();
  };

  // Handle selection from meal search results
  const handleSelectMealResult = async (item: MealComponent) => {
    // Set the name from the selected item
    setName(item.name);
    setEditingSavedRecipeId(null);
    setEditingSavedRecipeUpdatedAt(null);
    setEditingRecipeSignature(null);
    setMealSearchResults([]);
    setSearchMessage(null);

    if (item.itemType === 'recipe' && item.external_id) {
      trackRecipeUsage(item.external_id, 'search');
    }

    // If it's a recipe, fetch its ingredients
    if (item.itemType === 'recipe' && item.external_id) {
      try {
        const recipeIngredients = await getRecipeIngredients(item.external_id, languageCode);
        if (recipeIngredients.length > 0) {
          const transformedIngredients: MealComponent[] = recipeIngredients.map((ri, index: number) => ({
            id: `recipe-${index}-${Date.now()}`,
            name: ri.ingredient_name,
            amount_g: roundIngredientAmount(ri.quantity),
            source: 'database' as const,
            external_id: ri.ingredient_id,
            itemType: 'ingredient' as const,
            kcal_100: ri.kcal_100 || 0,
            protein_g_100: ri.protein_g_100 || 0,
            carbs_g_100: ri.carbs_g_100 || 0,
            fat_g_100: ri.fat_g_100 || 0,
            calculated_macros: calculateMacros(
              {
                kcal_100: ri.kcal_100 || 0,
                protein_g_100: ri.protein_g_100 || 0,
                carbs_g_100: ri.carbs_g_100 || 0,
                fat_g_100: ri.fat_g_100 || 0,
              },
              roundIngredientAmount(ri.quantity),
            ),
          }));
          setIngredients(transformedIngredients);
          setEditingRecipeSignature(buildRecipeSignature(item.name, transformedIngredients));
          setSearchMessage({ type: 'info', text: t('nutrition.ingredientsAddedAutomatically') });
        }
      } catch (error) {
        console.error('[MealLogForm] Error fetching recipe ingredients:', error);
      }
    } else {
      // It's a precooked ingredient - add as single item
      // Extract real weight from localized notes if available.
      let defaultAmount = 100;
      const localizedNotes = getLocalizedIngredientNotes(item);
      if (localizedNotes) {
        const weightMatch = localizedNotes.match(/(?:Peso Real|Actual weight):\s*(\d+(?:[.,]\d+)?)/i);
        if (weightMatch && weightMatch[1]) {
          const weight = parseIngredientAmountInput(weightMatch[1]);
          if (weight != null) {
            defaultAmount = weight;
          }
        }
      }

      const newIngredient: MealComponent = {
        id: Date.now().toString(),
        name: item.name,
        amount_g: defaultAmount,
        source: item.source,
        external_id: item.external_id,
        category: toFoodCategory(item.category),
        itemType: item.itemType,
        source_primary: item.source_primary, // Cast if needed or ensure types align
        kcal_100: item.kcal_100,
        protein_g_100: item.protein_g_100,
        carbs_g_100: item.carbs_g_100,
        fat_g_100: item.fat_g_100,
        calculated_macros: calculateMacros(item, defaultAmount),
      };
      setIngredients([newIngredient]);

      // Show info about precooked source
      const provider = item.source_primary?.provider || t('nutrition.externalSource');
      setSearchMessage({
        type: 'info',
        text: t('nutrition.providerMacrosOnlyInfo', { provider }),
      });
    }
  };

  // Preload a recipe chosen from the Recipe Library ("Usar"). Runs once on mount.
  const presetRecipeLoadedRef = useRef(false);
  useEffect(() => {
    if (presetRecipeLoadedRef.current) return;
    const presetId = params.presetRecipeId;
    if (!presetId) return;
    presetRecipeLoadedRef.current = true;
    void handleSelectMealResult({
      id: `preset_${presetId}`,
      external_id: presetId,
      name: params.presetRecipeName || '',
      source: 'database',
      itemType: 'recipe',
    });
  }, [params.presetRecipeId, params.presetRecipeName]);

  const normalizeName = (value: string): string =>
    value
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');

  const canResolveRecipeIngredient = (ingredient: MealComponent): boolean =>
    isUuid(ingredient.external_id) || ingredient.source === 'manual' || ingredient.source === 'openfoodfacts';

  const resolveRecipeIngredientId = async (ingredient: MealComponent): Promise<string | null> => {
    if (isUuid(ingredient.external_id)) {
      return ingredient.external_id;
    }

    if (ingredient.source !== 'manual' && ingredient.source !== 'openfoodfacts') {
      return null;
    }

    const source: Extract<MealItemsSource, 'manual' | 'openfoodfacts'> = ingredient.source;
    const category: IngredientsCategory = toFoodCategory(ingredient.category);
    const barcode = ingredient.barcode ?? (source === 'openfoodfacts' ? ingredient.external_id : null) ?? null;

    const { data, error } = await supabase.rpc('ensure_recipe_ingredient', {
      p_name_es: ingredient.name,
      p_name_en: ingredient.name,
      p_name_norm_es: normalizeName(ingredient.name),
      p_category: category,
      p_kcal_100: ingredient.kcal_100 ?? 0,
      p_protein_g_100: ingredient.protein_g_100 ?? 0,
      p_carbs_g_100: ingredient.carbs_g_100 ?? 0,
      p_fat_g_100: ingredient.fat_g_100 ?? 0,
      p_source: source,
      p_barcode: barcode ?? '',
    });

    if (error) {
      console.error('[MealLogForm] Error resolving recipe ingredient:', error);
      return null;
    }

    return data;
  };

  const getCurrentUserId = async (): Promise<string | null> => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user.id;
  };

  const getRecipeDetailLookupId = (item: MealComponent): string | null => {
    if (item.external_id) return item.external_id;
    if (item.id.startsWith('recipe_')) return item.id.replace(/^recipe_/, '');
    if (/^[0-9a-fA-F-]{36}$/.test(item.id)) return item.id;
    return null;
  };

  const loadRecipeDetailSource = async (item: MealComponent): Promise<void> => {
    const recipeId = getRecipeDetailLookupId(item);
    if (!recipeId) {
      setRecipeDetailSourceLabel(t('nutrition.recipeSourceUnknown'));
      return;
    }

    setIsRecipeDetailSourceLoading(true);
    try {
      const { data: recipeRow, error: recipeError } = await supabase
        .from('recipes')
        .select('source, owner_user_id')
        .eq('id', recipeId)
        .maybeSingle<{ source: 'system' | 'user'; owner_user_id: string | null }>();

      if (recipeError || !recipeRow) {
        setRecipeDetailSourceLabel(t('nutrition.recipeSourceUnknown'));
        return;
      }

      if (recipeRow.source === 'system') {
        setRecipeDetailSourceLabel(t('nutrition.recipeSourceSystem'));
        return;
      }

      if (!recipeRow.owner_user_id) {
        setRecipeDetailSourceLabel(t('nutrition.recipeSourceUnknown'));
        return;
      }

      const fallbackName = recipeRow.owner_user_id.slice(0, 8);
      const { data: ownerRow } = await supabase
        .from('users')
        .select('display_name, username')
        .eq('id', recipeRow.owner_user_id)
        .maybeSingle<{ display_name: string | null; username: string | null }>();

      const ownerName =
        ownerRow?.username?.trim() ||
        ownerRow?.display_name?.trim() ||
        t('nutrition.recipeSourceUserFallback', { id: fallbackName });

      setRecipeDetailSourceLabel(t('nutrition.recipeSourceUserBy', { user: ownerName }));
    } catch (error) {
      console.error('[MealLogForm] Error loading recipe source detail:', error);
      setRecipeDetailSourceLabel(t('nutrition.recipeSourceUnknown'));
    } finally {
      setIsRecipeDetailSourceLoading(false);
    }
  };

  const handleSaveCurrentRecipe = async () => {
    if (isSaving) return;

    if (!name.trim()) {
      Alert.alert(t('nutrition.missingMealNameTitle'), t('nutrition.missingMealNameMessage'));
      return;
    }

    if (ingredients.length === 0) {
      Alert.alert(t('nutrition.saveRecipeNeedsIngredientsTitle'), t('nutrition.saveRecipeNeedsIngredientsMessage'));
      return;
    }

    const missingDbIngredient = ingredients.some(ingredient => !canResolveRecipeIngredient(ingredient));
    if (missingDbIngredient) {
      Alert.alert(
        t('nutrition.saveRecipeNeedsDatabaseIngredientsTitle'),
        t('nutrition.saveRecipeNeedsDatabaseIngredientsMessage'),
      );
      return;
    }

    setIsSaving(true);

    try {
      const currentUserId = await getCurrentUserId();
      if (!currentUserId) {
        Alert.alert(t('common.error'), t('nutrition.saveMealError'));
        return;
      }

      const resolvedRecipeIngredientIds = await Promise.all(
        ingredients.map(ingredient => resolveRecipeIngredientId(ingredient)),
      );

      if (resolvedRecipeIngredientIds.some(ingredientId => !ingredientId)) {
        Alert.alert(
          t('nutrition.saveRecipeNeedsDatabaseIngredientsTitle'),
          t('nutrition.saveRecipeNeedsDatabaseIngredientsMessage'),
        );
        return;
      }

      const normalizedName = normalizeName(name.trim());
      let recipeId = editingSavedRecipeId;
      const nutritionSnapshot = buildRecipeNutritionSnapshot(ingredients, name.trim());

      if (recipeId) {
        if (!editingSavedRecipeUpdatedAt) {
          Alert.alert(t('common.error'), t('nutrition.recipeUpdateConflictMessage'));
          return;
        }

        const nextUpdatedAt = new Date().toISOString();
        const { error: updateRecipeError } = await supabase
          .from('recipes')
          .update({
            name_es: name.trim(),
            name_norm_es: normalizedName,
            ...nutritionSnapshot,
            updated_at: nextUpdatedAt,
          })
          .eq('id', recipeId)
          .eq('owner_user_id', currentUserId)
          .eq('updated_at', editingSavedRecipeUpdatedAt);

        if (updateRecipeError) {
          console.error('[MealLogForm] Error updating recipe:', updateRecipeError);
          Alert.alert(t('common.error'), t('nutrition.saveMealError'));
          return;
        }

        const { data: refreshedRecipe, error: refreshedRecipeError } = await supabase
          .from('recipes')
          .select('id')
          .eq('id', recipeId)
          .eq('owner_user_id', currentUserId)
          .eq('updated_at', nextUpdatedAt)
          .limit(1)
          .returns<{ id: string }[]>();

        if (refreshedRecipeError) {
          console.error('[MealLogForm] Error validating optimistic update:', refreshedRecipeError);
          Alert.alert(t('common.error'), t('nutrition.saveMealError'));
          return;
        }

        if (!refreshedRecipe || refreshedRecipe.length === 0) {
          Alert.alert(t('common.error'), t('nutrition.recipeUpdateConflictMessage'));
          return;
        }

        const { error: deleteItemsError } = await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);
        if (deleteItemsError) {
          console.error('[MealLogForm] Error replacing recipe items:', deleteItemsError);
          Alert.alert(t('common.error'), t('nutrition.saveMealError'));
          return;
        }
      } else {
        const { data: insertedRecipes, error: insertRecipeError } = await supabase
          .from('recipes')
          .insert({
            name_es: name.trim(),
            name_norm_es: normalizedName,
            owner_user_id: currentUserId,
            source: 'user',
            visibility: defaultRecipeVisibility,
            ...nutritionSnapshot,
          })
          .select('id')
          .limit(1)
          .returns<{ id: string }[]>();

        if (insertRecipeError || !insertedRecipes || insertedRecipes.length === 0) {
          console.error('[MealLogForm] Error creating recipe:', insertRecipeError);
          Alert.alert(t('common.error'), t('nutrition.saveMealError'));
          return;
        }

        recipeId = insertedRecipes[0].id;
      }

      const recipeItemsPayload = ingredients.map((ingredient, index) => ({
        recipe_id: recipeId as string,
        ingredient_id: resolvedRecipeIngredientIds[index] as string,
        order_index: index,
        quantity: roundIngredientAmount(ingredient.amount_g || 0),
        unit: 'g' as const,
      }));

      const { error: insertItemsError } = await supabase.from('recipe_items').insert(recipeItemsPayload);
      if (insertItemsError) {
        console.error('[MealLogForm] Error saving recipe items:', insertItemsError);
        Alert.alert(t('common.error'), t('nutrition.saveMealError'));
        return;
      }

      if (!isEditingRecipe && defaultRecipeVisibility === 'public' && recipeId) {
        try {
          await publishRecipe(recipeId);
        } catch (error) {
          console.error('[MealLogForm] Error publishing newly created recipe:', error);
        }
      }

      await maybeRefreshRecipeAggregates(true);
      setEditingSavedRecipeId(null);
      setEditingSavedRecipeUpdatedAt(null);
      setEditingRecipeSignature(null);
      Alert.alert(t('nutrition.recipeSavedTitle'), t('nutrition.recipeSavedMessage'));
    } catch (error) {
      console.error('[MealLogForm] Error saving recipe:', error);
      Alert.alert(t('common.error'), t('nutrition.saveMealError'));
    } finally {
      setIsSaving(false);
    }
  };

  const getMealResultBadge = (item: MealComponent): { text: string; color: string } => {
    if (item.itemType === 'recipe') {
      return {
        text: t('nutrition.recipe'),
        color: '#34C759',
      };
    }

    if (item.category === 'precocinado') {
      return {
        text: t('nutrition.preCooked'),
        color: '#FF9500',
      };
    }

    return {
      text: t('nutrition.all'),
      color: themeColors.primary,
    };
  };

  // Quick-amount chips for the selected ingredient card: 50/100/150 g plus the
  // last amount used this session. Tapping one fills the editable amount input.
  const renderQuickAmountChips = () => {
    const presets = [50, 100, 150];
    const chipValues =
      lastIngredientAmount != null && !presets.includes(lastIngredientAmount)
        ? [...presets, lastIngredientAmount]
        : presets;
    const currentAmount = parseIngredientAmountInput(amountInput);

    return (
      <View style={styles.quickAmountRow}>
        {chipValues.map(value => {
          const isActive = currentAmount === value;
          return (
            <TouchableOpacity
              key={value}
              style={[
                styles.quickAmountChip,
                {
                  backgroundColor: isActive
                    ? themeColors.primary + '20'
                    : isDark
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(0,0,0,0.04)',
                  borderColor: isActive ? themeColors.primary + '55' : 'transparent',
                },
              ]}
              onPress={() => setAmountInput(formatIngredientAmount(value))}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text
                style={[
                  styles.quickAmountChipText,
                  { color: isActive ? themeColors.primary : themeColors.textSecondary },
                ]}
              >
                {value} g
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // --- Handlers ---

  const handleStartEdit = (ing: MealComponent) => {
    setEditingIngredientId(ing.id);
    setEditAmountInput(formatIngredientAmount(ing.amount_g || 0));
  };

  const handleCancelEdit = () => {
    setEditingIngredientId(null);
    setEditAmountInput('');
  };

  const handleSaveEdit = () => {
    const amount = parseIngredientAmountInput(editAmountInput);
    if (amount == null) return;

    setIngredients(prev =>
      prev.map(ing => {
        if (ing.id === editingIngredientId) {
          return {
            ...ing,
            amount_g: amount,
            calculated_macros: calculateMacros(ing, amount),
          };
        }
        return ing;
      }),
    );

    setEditingIngredientId(null);
    setEditAmountInput('');
  };

  const handleAddIngredient = () => {
    const amount = parseIngredientAmountInput(amountInput);
    if (amount == null) return;

    let newIngredient: MealComponent;

    if (inputMode === 'manual') {
      if (!manualIngName) return;
      if (!isManualIngredientFormComplete) return;

      newIngredient = {
        id: Date.now().toString(),
        name: manualIngName,
        amount_g: amount,
        source: 'manual',
        kcal_100: manualPer100g.kcal_100,
        protein_g_100: manualPer100g.protein_g_100,
        carbs_g_100: manualPer100g.carbs_g_100,
        fat_g_100: manualPer100g.fat_g_100,
        calculated_macros: calculateMacros(manualPer100g, amount),
      };
    } else if (selectedFood) {
      newIngredient = {
        id: Date.now().toString(),
        name: selectedFood.name,
        amount_g: amount,
        source: selectedFood.source,
        external_id: selectedFood.external_id,
        category: toFoodCategory(selectedFood.category),
        brand: selectedFood.brand,
        barcode: selectedFood.barcode,
        kcal_100: selectedFood.kcal_100,
        protein_g_100: selectedFood.protein_g_100,
        carbs_g_100: selectedFood.carbs_g_100,
        fat_g_100: selectedFood.fat_g_100,
        calculated_macros: calculateMacros(selectedFood, amount),
        itemType: selectedFood.itemType,
        source_primary: selectedFood.source_primary,
      };
    } else {
      return;
    }

    setIngredients([...ingredients, newIngredient]);
    setLastIngredientAmount(amount);

    // Reset form
    setManualIngName('');
    setAmountInput('');
    setSelectedFood(null);
    setManualPer100g({ kcal_100: 0, protein_g_100: 0, carbs_g_100: 0, fat_g_100: 0 });
    setManualMacroInputs({ kcal_100: '', protein_g_100: '', carbs_g_100: '', fat_g_100: '' });
  };

  // One-tap add from "Tendencias para ti": append the food with the user's usual
  // portion and seed the meal name if it's still empty.
  const handlePickTrend = (food: MealComponent) => {
    const amount = food.amount_g || 100;
    const newIngredient: MealComponent = {
      ...food,
      id: `${Date.now()}-${food.id}`,
      amount_g: amount,
      calculated_macros: calculateMacros(food, amount),
    };

    setIngredients(prev => [...prev, newIngredient]);
    setLastIngredientAmount(amount);
    if (!name.trim()) {
      setName(food.name);
    }
  };

  const handleRemoveIngredient = (id: string) => {
    setIngredients(ingredients.filter(i => i.id !== id));
  };

  const handleBarcodeDetected = async (barcode: string) => {
    setShowScanner(false);
    setIsBarcodeLookupPending(true);

    try {
      const product = await fetchByBarcode(barcode);

      if (product) {
        setSelectedFood(product);
        setAmountInput('100');
        return;
      }

      Alert.alert(t('nutrition.productNotFoundTitle'), t('nutrition.productNotFoundMessage', { barcode }), [
        { text: t('nutrition.scanAnother'), onPress: () => setShowScanner(true) },
        { text: t('nutrition.manualEntry'), onPress: () => setInputMode('manual') },
      ]);
    } catch (error) {
      console.error('Barcode lookup error:', error);
      Alert.alert(t('common.error'), t('nutrition.productInfoFetchError'), [
        { text: t('nutrition.retry'), onPress: () => setShowScanner(true) },
      ]);
    } finally {
      setIsBarcodeLookupPending(false);
    }
  };

  // Calculate totals
  const computedMacros = useMemo(() => calculateTotalMacros(ingredients), [ingredients]);
  const finalMacros = ingredients.length > 0 ? computedMacros : manualMacros;
  const canRegisterMeal = !isSaving && !!name;

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('nutrition.missingMealNameTitle'), t('nutrition.missingMealNameMessage'));
      return;
    }

    setIsSaving(true);
    try {
      const logData = {
        id: mealItem?.log?.id,
        meal_type: mealType,
        name: name,
        date: date,
        kcal: finalMacros.kcal,
        protein_g: finalMacros.protein_g,
        carbs_g: finalMacros.carbs_g,
        fats_g: finalMacros.fats_g,
        source: 'manual',
      };

      const ingredientsPayload = ingredients.map(ing => ({
        name: ing.name,
        quantity_g: roundIngredientAmount(ing.amount_g || 0),
        source: ing.source,
        source_ref: ing.external_id,
        kcal_100: ing.kcal_100,
        protein_g_100: ing.protein_g_100,
        carbs_g_100: ing.carbs_g_100,
        fat_g_100: ing.fat_g_100,
      }));

      await saveMeal.mutateAsync({
        log: logData,
        ingredients: ingredientsPayload,
      });

      // Return to NutritionHome preserving the selected day context there
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert(t('common.error'), t('nutrition.saveMealError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingBottom: 0 }}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: 'transparent' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={24} color={themeColors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
              {isEdit ? t('common.edit') : t('nutrition.log')} {t(MEAL_TYPE_LABELS[mealType]) || t('nutrition.meal')}
            </Text>
            <Text style={[styles.headerDate, { color: themeColors.textSecondary }]}>
              {formatLocalizedDate(new Date(date), {
                en: 'EEEE, MMMM d',
                es: "EEEE d 'de' MMMM",
              })}
            </Text>
          </View>
          <TouchableOpacity onPress={handleSave} disabled={!canRegisterMeal} style={styles.saveBtn}>
            {isSaving ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <Text
                style={[
                  styles.saveBtnText,
                  { color: themeColors.primary },
                  !canRegisterMeal && { color: themeColors.textSecondary },
                ]}
              >
                {t('nutrition.log')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={[
                styles.openRecipeLibraryButton,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                },
              ]}
              onPress={() => navigation.navigate('RecipeLibrary')}
              activeOpacity={0.85}
            >
              <Bookmark size={16} color={themeColors.primary} strokeWidth={2.3} />
              <Text style={[styles.openRecipeLibraryButtonText, { color: themeColors.primary }]}>
                {t('nutrition.openRecipeLibrary')}
              </Text>
            </TouchableOpacity>

            <>
              {/* Name Input - Simple & Elegant */}
              <View style={styles.nameSection}>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[
                      styles.nameInput,
                      {
                        color: themeColors.textPrimary,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      },
                    ]}
                    placeholder={t('nutrition.mealName')}
                    value={name}
                    onChangeText={setName}
                    placeholderTextColor={themeColors.textSecondary}
                    autoFocus={!isEdit}
                  />
                  {/* Search Button - Apple Liquid Glass Style */}
                  {name.length >= 2 && !isEdit && ingredients.length === 0 && (
                    <TouchableOpacity style={styles.aiButton} onPress={handleAiSearch} disabled={isSearchingRecipe}>
                      <LinearGradient
                        colors={['#007AFF', '#00C6FF']} // Premium Blue Gradient
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.aiButtonGradient}
                      >
                        {isSearchingRecipe ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Search size={18} color="#FFFFFF" strokeWidth={2.5} />
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>

                {isEditingRecipe && (
                  <View
                    style={[
                      styles.savedRecipeIndicator,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                      },
                    ]}
                  >
                    <Bookmark size={13} color={themeColors.textSecondary} strokeWidth={2.3} />
                    <Text style={[styles.savedRecipeIndicatorText, { color: themeColors.textSecondary }]}>
                      {t('nutrition.savedRecipeIndicator')}
                    </Text>
                  </View>
                )}

                {/* Search Message / Error */}
                {searchMessage && (
                  <View
                    style={[
                      styles.messageCard,
                      searchMessage.type === 'error' ? styles.messageError : styles.messageInfo,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        searchMessage.type === 'error' ? styles.messageTextError : styles.messageTextInfo,
                      ]}
                    >
                      {searchMessage.text}
                    </Text>
                  </View>
                )}

                {/* Meal Search Results with Badges */}
                {mealSearchResults.length > 0 && (
                  <View style={styles.mealSearchResults}>
                    <View style={styles.resultsHeaderRow}>
                      <Text style={[styles.resultsTitle, { color: themeColors.textSecondary }]}>
                        {t('nutrition.resultsTitleParen')}
                        {mealSearchResults.length})
                      </Text>
                      <View
                        style={[
                          styles.resultHintBadge,
                          {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                          },
                        ]}
                      >
                        <Text style={[styles.resultHintText, { color: themeColors.textSecondary }]}>
                          {t('nutrition.recipe')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.mealResultFiltersRow}>
                      {[
                        { key: 'recipe' as const, label: t('nutrition.recipe'), count: recipeSearchResults.length },
                        {
                          key: 'precooked' as const,
                          label: t('nutrition.preCooked'),
                          count: precookedSearchResults.length,
                        },
                        {
                          key: 'all' as const,
                          label: t('nutrition.all'),
                          count: mealSearchResults.length,
                        },
                      ].map(filter => {
                        const isActive = mealSearchFilter === filter.key;
                        return (
                          <TouchableOpacity
                            key={filter.key}
                            style={[
                              styles.mealFilterChip,
                              {
                                backgroundColor: isActive
                                  ? themeColors.primary + '20'
                                  : isDark
                                    ? 'rgba(255,255,255,0.05)'
                                    : 'rgba(0,0,0,0.04)',
                                borderColor: isActive ? themeColors.primary + '55' : 'transparent',
                              },
                            ]}
                            onPress={() => setMealSearchFilter(filter.key)}
                          >
                            <Text
                              style={[
                                styles.mealFilterChipText,
                                {
                                  color: isActive ? themeColors.primary : themeColors.textSecondary,
                                },
                              ]}
                            >
                              {filter.label} ({filter.count})
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {(mealSearchFilter === 'all'
                      ? [
                          { section: t('nutrition.recipe'), data: paginatedRecipeSearchResults },
                          { section: t('nutrition.preCooked'), data: precookedSearchResults },
                        ]
                      : [
                          {
                            section: null,
                            data:
                              mealSearchFilter === 'recipe' ? paginatedRecipeSearchResults : filteredMealSearchResults,
                          },
                        ]
                    ).map((group, groupIndex) => {
                      if (group.data.length === 0) return null;

                      return (
                        <View key={`${group.section ?? 'mixed'}-${groupIndex}`} style={styles.mealResultSection}>
                          {group.section ? (
                            <Text style={[styles.mealResultSectionTitle, { color: themeColors.textSecondary }]}>
                              {group.section} ({group.data.length})
                            </Text>
                          ) : null}

                          {group.data.map(item => {
                            const badge = getMealResultBadge(item);

                            return (
                              <TouchableOpacity
                                key={item.id}
                                style={[
                                  styles.mealResultItem,
                                  {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                  },
                                ]}
                                onPress={() => handleSelectMealResult(item)}
                              >
                                <View style={styles.mealResultInfo}>
                                  <Text
                                    style={[styles.mealResultName, { color: themeColors.textPrimary }]}
                                    numberOfLines={1}
                                  >
                                    {item.name}
                                  </Text>
                                  <View style={styles.mealResultMeta}>
                                    <View style={[styles.mealBadge, { backgroundColor: badge.color + '20' }]}>
                                      <Text style={[styles.mealBadgeText, { color: badge.color }]}>{badge.text}</Text>
                                    </View>
                                    <Text style={[styles.mealResultMacros, { color: themeColors.textSecondary }]}>
                                      {item.kcal_100}
                                      {t('nutrition.kcalPer100g')}
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.mealResultActions}>
                                  <TouchableOpacity
                                    style={styles.mealInfoBtn}
                                    onPress={() => handleShowMealDetail(item)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <Info size={18} color={themeColors.textSecondary} />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.mealAddBtn}
                                    onPress={() => handleSelectMealResult(item)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <Plus size={20} color={themeColors.primary} />
                                  </TouchableOpacity>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                    {showMealRecipePagination && (
                      <View style={styles.recipePaginationRow}>
                        <TouchableOpacity
                          style={[
                            styles.recipePaginationButton,
                            mealRecipePage === 1 && styles.recipePaginationButtonDisabled,
                            { borderColor: themeColors.border },
                          ]}
                          onPress={() => setMealRecipePage(prev => Math.max(1, prev - 1))}
                          disabled={mealRecipePage === 1}
                        >
                          <Text
                            style={[
                              styles.recipePaginationButtonText,
                              { color: mealRecipePage === 1 ? themeColors.textSecondary : themeColors.textPrimary },
                            ]}
                          >
                            {t('nutrition.recipeLibraryPagePrev')}
                          </Text>
                        </TouchableOpacity>
                        <Text style={[styles.recipePaginationLabel, { color: themeColors.textSecondary }]}>
                          {t('nutrition.recipeLibraryPageIndicator', {
                            current: mealRecipePage,
                            total: mealRecipeTotalPages,
                          })}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.recipePaginationButton,
                            mealRecipePage >= mealRecipeTotalPages && styles.recipePaginationButtonDisabled,
                            { borderColor: themeColors.border },
                          ]}
                          onPress={() => setMealRecipePage(prev => Math.min(mealRecipeTotalPages, prev + 1))}
                          disabled={mealRecipePage >= mealRecipeTotalPages}
                        >
                          <Text
                            style={[
                              styles.recipePaginationButtonText,
                              {
                                color:
                                  mealRecipePage >= mealRecipeTotalPages
                                    ? themeColors.textSecondary
                                    : themeColors.textPrimary,
                              },
                            ]}
                          >
                            {t('nutrition.recipeLibraryPageNext')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {ingredients.length > 0 && (
                <View style={styles.ingredientsSection}>
                  <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
                    {t('nutrition.ingredientsTitleParen')}
                    {ingredients.length})
                  </Text>
                  {ingredients.map(ing => {
                    const isEditing = ing.id === editingIngredientId;
                    return (
                      <View
                        key={ing.id}
                        style={[
                          styles.ingredientCard,
                          dynamicStyles.card, // dynamic background
                          { shadowColor: themeColors.shadow },
                        ]}
                      >
                        <View style={styles.ingredientMain}>
                          <View style={styles.ingredientInfo}>
                            <Text style={[styles.ingredientName, { color: themeColors.textPrimary }]}>{ing.name}</Text>

                            {isEditing ? (
                              <View>
                                <View style={styles.editRow}>
                                  <TextInput
                                    style={[
                                      styles.editInput,
                                      {
                                        color: themeColors.primary,
                                        borderColor: themeColors.primary,
                                      },
                                    ]}
                                    value={editAmountInput}
                                    onChangeText={value => setEditAmountInput(sanitizeIngredientAmountInput(value))}
                                    keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                                    autoFocus
                                    selectTextOnFocus
                                  />
                                  <Text style={[styles.editUnit, { color: themeColors.textSecondary }]}>g</Text>
                                </View>
                                {isIngredientAmountOverLimit(editAmountInput) && (
                                  <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 4 }}>
                                    {t('nutrition.max1kgLabel')}
                                  </Text>
                                )}
                              </View>
                            ) : (
                              <View style={styles.ingredientMeta}>
                                <Text style={[styles.ingredientAmount, { color: themeColors.primary }]}>
                                  {formatIngredientAmount(ing.amount_g || 0)}g
                                </Text>
                                <View style={styles.dot} />
                                <Text style={[styles.ingredientSource, { color: themeColors.textSecondary }]}>
                                  {convertEnergyToUi(ing.calculated_macros?.kcal || 0).label}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.ingredientActions}>
                            {isEditing ? (
                              <>
                                <TouchableOpacity
                                  onPress={handleSaveEdit}
                                  style={[
                                    styles.actionBtn,
                                    isIngredientAmountOverLimit(editAmountInput) && { opacity: 0.5 },
                                  ]}
                                  disabled={isIngredientAmountOverLimit(editAmountInput)}
                                >
                                  <Check size={20} color={themeColors.primary} strokeWidth={2.5} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleCancelEdit} style={styles.actionBtn}>
                                  <X size={20} color={themeColors.textSecondary} strokeWidth={2.5} />
                                </TouchableOpacity>
                              </>
                            ) : (
                              <>
                                <TouchableOpacity onPress={() => handleStartEdit(ing)} style={styles.actionBtn}>
                                  <Text style={[styles.actionBtnText, { color: themeColors.primary }]}>
                                    {t('common.edit')}
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => handleRemoveIngredient(ing.id)}
                                  style={styles.actionBtn}
                                >
                                  <Trash2 size={16} color={themeColors.danger} strokeWidth={2} />
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.recipeBuilderActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.recipeBuilderSaveButton,
                    {
                      backgroundColor:
                        canSubmitRecipe && !isSaving
                          ? themeColors.primary
                          : isDark
                            ? 'rgba(255,255,255,0.14)'
                            : 'rgba(0,0,0,0.12)',
                    },
                  ]}
                  onPress={handleSaveCurrentRecipe}
                  disabled={!canSubmitRecipe || isSaving}
                >
                  <View style={styles.recipeBuilderSaveButtonContent}>
                    {isSaving ? (
                      <>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.recipeBuilderSaveButtonText}>
                          {isEditingRecipe ? t('nutrition.updatingRecipeAction') : t('nutrition.savingRecipeAction')}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.recipeBuilderSaveButtonText}>
                        {isEditingRecipe ? t('nutrition.updateRecipeAction') : t('nutrition.saveRecipeAction')}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
                <Text style={[styles.recipeBuilderSaveHint, { color: themeColors.textSecondary }]}>
                  {t('nutrition.saveRecipeHint')}
                </Text>
              </View>

              {/* Add Ingredient Section */}
              <View style={styles.addSection}>
                {/* Simple Tab Selector */}
                <View style={styles.tabRow}>
                  <TouchableOpacity
                    onPress={() => setInputMode('search')}
                    style={[
                      styles.tab,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                      inputMode === 'search' && { backgroundColor: themeColors.primary + '15' },
                    ]}
                  >
                    <Search
                      size={16}
                      color={inputMode === 'search' ? themeColors.primary : themeColors.textSecondary}
                      strokeWidth={2}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        { color: themeColors.textSecondary },
                        inputMode === 'search' && { color: themeColors.primary, fontWeight: '600' },
                      ]}
                    >
                      {t('nutrition.search')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setInputMode('scan')}
                    style={[
                      styles.tab,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                      inputMode === 'scan' && { backgroundColor: themeColors.primary + '15' },
                    ]}
                  >
                    <ScanBarcode
                      size={16}
                      color={inputMode === 'scan' ? themeColors.primary : themeColors.textSecondary}
                      strokeWidth={2}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        { color: themeColors.textSecondary },
                        inputMode === 'scan' && { color: themeColors.primary, fontWeight: '600' },
                      ]}
                    >
                      {t('nutrition.scan')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setInputMode('manual')}
                    style={[
                      styles.tab,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                      inputMode === 'manual' && { backgroundColor: themeColors.primary + '15' },
                    ]}
                  >
                    <Plus
                      size={16}
                      color={inputMode === 'manual' ? themeColors.primary : themeColors.textSecondary}
                      strokeWidth={2}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        { color: themeColors.textSecondary },
                        inputMode === 'manual' && { color: themeColors.primary, fontWeight: '600' },
                      ]}
                    >
                      {t('nutrition.manual')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Input Area */}
                <View style={styles.inputContainer}>
                  {inputMode === 'search' && (
                    <>
                      {!selectedFood ? (
                        <>
                          <PersonalFoodTrends mealType={mealType} onPick={handlePickTrend} />
                          <IngredientSearchPanel
                            onSelect={food => {
                              setSelectedFood(food);
                              setAmountInput('100');
                            }}
                            onGoToManual={() => setInputMode('manual')}
                          />
                        </>
                      ) : (
                        <View
                          style={[
                            styles.selectedCard,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                            },
                          ]}
                        >
                          <View style={styles.selectedRow}>
                            <Text style={[styles.selectedName, { color: themeColors.textPrimary }]} numberOfLines={1}>
                              {selectedFood.name}
                            </Text>
                            <TouchableOpacity
                              onPress={() => setSelectedFood(null)}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <X size={18} color={themeColors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                          {renderQuickAmountChips()}
                          <View style={styles.amountRow}>
                            <TextInput
                              style={[
                                styles.amountInput,
                                {
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFF',
                                  color: themeColors.textPrimary,
                                  borderColor: themeColors.border,
                                },
                              ]}
                              value={amountInput}
                              onChangeText={value => setAmountInput(sanitizeIngredientAmountInput(value))}
                              keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                              placeholder="100"
                              placeholderTextColor={themeColors.textSecondary}
                              selectTextOnFocus
                            />
                            <Text style={[styles.amountUnit, { color: themeColors.textSecondary }]}>g</Text>
                            <TouchableOpacity
                              onPress={handleAddIngredient}
                              style={[
                                styles.addBtn,
                                isIngredientAmountOverLimit(amountInput) && {
                                  backgroundColor: themeColors.textSecondary,
                                  opacity: 0.5,
                                },
                              ]}
                              disabled={isIngredientAmountOverLimit(amountInput)}
                            >
                              <Text style={styles.addBtnText}>{t('nutrition.add')}</Text>
                            </TouchableOpacity>
                          </View>
                          {isIngredientAmountOverLimit(amountInput) && (
                            <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 4, marginLeft: 4 }}>
                              {t('nutrition.maxInputLimit1kg')}
                            </Text>
                          )}
                        </View>
                      )}
                    </>
                  )}

                  {inputMode === 'scan' && (
                    <>
                      {!selectedFood ? (
                        isBarcodeLookupPending ? (
                          <View
                            style={[
                              styles.scanLoadingCard,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                borderColor: themeColors.border,
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.scanLoadingIcon,
                                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                              ]}
                            >
                              <ActivityIndicator size="small" color={themeColors.primary} />
                            </View>
                            <Text style={[styles.scanLoadingTitle, { color: themeColors.textPrimary }]}>
                              {t('nutrition.searchingScannedProduct')}
                            </Text>
                            <Text style={[styles.scanLoadingSubtitle, { color: themeColors.textSecondary }]}>
                              {t('nutrition.loadingBarcodeData')}
                            </Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[
                              styles.scanButton,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : themeColors.textPrimary,
                              },
                            ]}
                            onPress={() => setShowScanner(true)}
                          >
                            <ScanBarcode
                              size={40}
                              color={isDark ? themeColors.textPrimary : themeColors.background}
                              strokeWidth={2}
                            />
                            <Text
                              style={[
                                styles.scanButtonText,
                                { color: isDark ? themeColors.textPrimary : themeColors.background },
                              ]}
                            >
                              {t('nutrition.openBarcodeScanner')}
                            </Text>
                          </TouchableOpacity>
                        )
                      ) : (
                        <View
                          style={[
                            styles.selectedCard,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                            },
                          ]}
                        >
                          <View style={styles.selectedRow}>
                            <Text style={[styles.selectedName, { color: themeColors.textPrimary }]} numberOfLines={1}>
                              {selectedFood.name}
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                setSelectedFood(null);
                                setAmountInput('');
                              }}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <X size={18} color={themeColors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                          {renderQuickAmountChips()}
                          <View style={styles.amountRow}>
                            <TextInput
                              style={[
                                styles.amountInput,
                                {
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFF',
                                  color: themeColors.textPrimary,
                                  borderColor: themeColors.border,
                                },
                              ]}
                              value={amountInput}
                              onChangeText={value => setAmountInput(sanitizeIngredientAmountInput(value))}
                              keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                              placeholder="100"
                              placeholderTextColor={themeColors.textSecondary}
                              selectTextOnFocus
                            />
                            <Text style={[styles.amountUnit, { color: themeColors.textSecondary }]}>g</Text>
                            <TouchableOpacity
                              onPress={handleAddIngredient}
                              style={[
                                styles.addBtn,
                                isIngredientAmountOverLimit(amountInput) && {
                                  backgroundColor: themeColors.textSecondary,
                                  opacity: 0.5,
                                },
                              ]}
                              disabled={isIngredientAmountOverLimit(amountInput)}
                            >
                              <Text style={styles.addBtnText}>{t('nutrition.add')}</Text>
                            </TouchableOpacity>
                          </View>
                          {isIngredientAmountOverLimit(amountInput) && (
                            <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 4, marginLeft: 4 }}>
                              {t('nutrition.maxInputLimit1kg')}
                            </Text>
                          )}
                        </View>
                      )}
                    </>
                  )}

                  {inputMode === 'manual' && (
                    <View style={styles.manualForm}>
                      <TextInput
                        style={[
                          styles.manualInput,
                          {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFF',
                            color: themeColors.textPrimary,
                            borderColor: themeColors.border,
                          },
                        ]}
                        placeholder={t('nutrition.ingredientName')}
                        value={manualIngName}
                        onChangeText={setManualIngName}
                        placeholderTextColor={themeColors.textSecondary}
                      />
                      <TextInput
                        style={[
                          styles.manualInput,
                          {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFF',
                            color: themeColors.textPrimary,
                            borderColor: themeColors.border,
                          },
                        ]}
                        value={amountInput}
                        onChangeText={value => setAmountInput(sanitizeIngredientAmountInput(value))}
                        keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                        placeholder={t('nutrition.weightGrams')}
                        placeholderTextColor={themeColors.textSecondary}
                      />
                      {isIngredientAmountOverLimit(amountInput) && (
                        <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: -8, marginBottom: 4 }}>
                          {t('nutrition.maxInputLimit1kg')}
                        </Text>
                      )}
                      <Text style={[styles.manualLabel, { color: themeColors.textSecondary }]}>
                        {t('nutrition.nutritionInfo100g')}
                      </Text>
                      <View style={styles.macrosGrid}>
                        <View style={styles.macroField}>
                          <Text style={[styles.macroFieldLabel, { color: themeColors.textSecondary }]}>
                            {units.energy === 'kcal' ? t('nutrition.kcal') : t('nutrition.unitKj')}
                          </Text>
                          <TextInput
                            style={[
                              styles.macroFieldInput,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFF',
                                color: themeColors.textPrimary,
                                borderColor: themeColors.border,
                              },
                            ]}
                            placeholder="0"
                            value={manualMacroInputs.kcal_100}
                            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                            placeholderTextColor={themeColors.textSecondary}
                            onChangeText={text => {
                              const value = sanitizeIngredientAmountInput(text);
                              setManualMacroInputs(prev => ({ ...prev, kcal_100: value }));
                              setManualPer100g({
                                ...manualPer100g,
                                kcal_100: parseEnergyToKcal(parseManualMacroInput(value) ?? 0),
                              });
                            }}
                          />
                        </View>
                        <View style={styles.macroField}>
                          <Text style={[styles.macroFieldLabel, { color: themeColors.textSecondary }]}>
                            {t('nutrition.proteinCaps')}
                          </Text>
                          <TextInput
                            style={[
                              styles.macroFieldInput,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFF',
                                color: themeColors.textPrimary,
                                borderColor: themeColors.border,
                              },
                            ]}
                            placeholder="0"
                            value={manualMacroInputs.protein_g_100}
                            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                            placeholderTextColor={themeColors.textSecondary}
                            onChangeText={text => {
                              const value = sanitizeIngredientAmountInput(text);
                              setManualMacroInputs(prev => ({ ...prev, protein_g_100: value }));
                              setManualPer100g({
                                ...manualPer100g,
                                protein_g_100: parseManualMacroInput(value) ?? 0,
                              });
                            }}
                          />
                        </View>
                        <View style={styles.macroField}>
                          <Text style={[styles.macroFieldLabel, { color: themeColors.textSecondary }]}>
                            {t('nutrition.carbsShort')}
                          </Text>
                          <TextInput
                            style={[
                              styles.macroFieldInput,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFF',
                                color: themeColors.textPrimary,
                                borderColor: themeColors.border,
                              },
                            ]}
                            placeholder="0"
                            value={manualMacroInputs.carbs_g_100}
                            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                            placeholderTextColor={themeColors.textSecondary}
                            onChangeText={text => {
                              const value = sanitizeIngredientAmountInput(text);
                              setManualMacroInputs(prev => ({ ...prev, carbs_g_100: value }));
                              setManualPer100g({
                                ...manualPer100g,
                                carbs_g_100: parseManualMacroInput(value) ?? 0,
                              });
                            }}
                          />
                        </View>
                        <View style={styles.macroField}>
                          <Text style={[styles.macroFieldLabel, { color: themeColors.textSecondary }]}>
                            {t('nutrition.fats')}
                          </Text>
                          <TextInput
                            style={[
                              styles.macroFieldInput,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFF',
                                color: themeColors.textPrimary,
                                borderColor: themeColors.border,
                              },
                            ]}
                            placeholder="0"
                            value={manualMacroInputs.fat_g_100}
                            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                            placeholderTextColor={themeColors.textSecondary}
                            onChangeText={text => {
                              const value = sanitizeIngredientAmountInput(text);
                              setManualMacroInputs(prev => ({ ...prev, fat_g_100: value }));
                              setManualPer100g({
                                ...manualPer100g,
                                fat_g_100: parseManualMacroInput(value) ?? 0,
                              });
                            }}
                          />
                        </View>
                      </View>
                      {shouldShowManualIngredientNutritionWarning && (
                        <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 6 }}>
                          {t('nutrition.manualIngredientNutritionInvalid')}
                        </Text>
                      )}
                      <TouchableOpacity
                        onPress={handleAddIngredient}
                        style={[
                          styles.manualAddButton,
                          !isManualIngredientFormComplete && {
                            backgroundColor: themeColors.textSecondary,
                            opacity: 0.5,
                          },
                        ]}
                        disabled={!isManualIngredientFormComplete}
                      >
                        <Text style={styles.manualAddButtonText}>{t('nutrition.addIngredient')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </>

            {/* Legal Disclaimer */}
            <View style={styles.legalDisclaimerContainer}>
              <Text style={[styles.legalDisclaimerText, { color: themeColors.textSecondary }]}>
                {t('nutrition.nutriScoreDisclaimer')}
              </Text>
            </View>

            <View style={{ height: 180 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Bottom Summary - Liquid Glass (Keep as is) */}
        <MacrosSummaryCard totals={finalMacros} itemCount={ingredients.length} hasIncompleteData={false} />

        {/* Meal Detail Modal - Unified structure */}
        <Modal visible={showMealDetailModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  {selectedMealDetail && (
                    <View
                      style={[
                        styles.detailBadge,
                        {
                          backgroundColor: (selectedMealDetail.itemType === 'recipe' ? '#34C759' : '#FF9500') + '20',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.detailBadgeText,
                          {
                            color: selectedMealDetail.itemType === 'recipe' ? '#34C759' : '#FF9500',
                          },
                        ]}
                      >
                        {selectedMealDetail.itemType === 'recipe' ? t('nutrition.recipe') : t('nutrition.preCooked')}
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => setShowMealDetailModal(false)} style={{ padding: 4 }}>
                  <X size={24} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
                <Text style={[styles.detailMainName, { color: themeColors.textPrimary }]}>
                  {selectedMealDetail?.name}
                </Text>
                {!!selectedMealDetail?.description && (
                  <Text style={[styles.detailDescription, { color: themeColors.textSecondary }]}>
                    {selectedMealDetail.description}
                  </Text>
                )}

                {/* Quality Score - Visual */}
                {selectedMealDetail?.quality_score !== undefined && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailSectionLabel, { color: themeColors.textSecondary }]}>
                      {t('nutrition.qualityScore')}
                    </Text>
                    <View style={styles.qualityRow}>
                      <View
                        style={[
                          styles.qualityBadge,
                          {
                            backgroundColor:
                              selectedMealDetail.quality_score >= 0.8
                                ? '#038141'
                                : selectedMealDetail.quality_score >= 0.6
                                  ? '#85BB2F'
                                  : selectedMealDetail.quality_score >= 0.4
                                    ? '#FECB02'
                                    : selectedMealDetail.quality_score >= 0.2
                                      ? '#EE8100'
                                      : '#E63E11',
                          },
                        ]}
                      >
                        <Text style={styles.qualityLetter}>
                          {selectedMealDetail.quality_score >= 0.8
                            ? 'A'
                            : selectedMealDetail.quality_score >= 0.6
                              ? 'B'
                              : selectedMealDetail.quality_score >= 0.4
                                ? 'C'
                                : selectedMealDetail.quality_score >= 0.2
                                  ? 'D'
                                  : 'E'}
                        </Text>
                      </View>
                      <Text style={[styles.qualityPercent, { color: themeColors.textPrimary }]}>
                        {Math.round(selectedMealDetail.quality_score * 100)}%
                      </Text>
                    </View>
                  </View>
                )}

                {selectedMealDetail?.itemType === 'recipe' && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailSectionLabel, { color: themeColors.textSecondary }]}>
                      {t('nutrition.sourceAllCaps')}
                    </Text>
                    {isRecipeDetailSourceLoading ? (
                      <ActivityIndicator size="small" color={themeColors.primary} />
                    ) : (
                      <Text style={[styles.sourceText, { color: themeColors.textPrimary }]}>
                        {recipeDetailSourceLabel || t('nutrition.recipeSourceUnknown')}
                      </Text>
                    )}
                  </View>
                )}

                {/* Macros Card */}
                {selectedMealDetail && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailSectionLabel, { color: themeColors.textSecondary }]}>
                      {t('nutrition.nutritionInfo100g')}
                    </Text>
                    <View
                      style={[
                        styles.macrosCard,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                        },
                      ]}
                    >
                      <View style={styles.macroRow}>
                        <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>
                          {t('nutrition.energy')}
                        </Text>
                        <Text style={[styles.macroValue, { color: themeColors.primary }]}>
                          {formatDetailValue(selectedMealDetail.kcal_100)}
                          {t('nutrition.kcal')}
                        </Text>
                      </View>
                      <View style={styles.macroRow}>
                        <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>
                          {t('nutrition.proteins')}
                        </Text>
                        <Text style={[styles.macroValue, { color: themeColors.textPrimary }]}>
                          {formatDetailValue(selectedMealDetail.protein_g_100)} g
                        </Text>
                      </View>
                      <View style={styles.macroRow}>
                        <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>
                          {t('nutrition.carbs')}
                        </Text>
                        <Text style={[styles.macroValue, { color: themeColors.textPrimary }]}>
                          {formatDetailValue(selectedMealDetail.carbs_g_100)} g
                        </Text>
                      </View>
                      <View style={[styles.macroRow, { borderBottomWidth: 0 }]}>
                        <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>
                          {t('nutrition.fats')}
                        </Text>
                        <Text style={[styles.macroValue, { color: themeColors.textPrimary }]}>
                          {formatDetailValue(selectedMealDetail.fat_g_100)} g
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Recipe Ingredients */}
                {selectedMealDetail?.itemType === 'recipe' && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailSectionLabel, { color: themeColors.textSecondary }]}>
                      {t('nutrition.ingredientsTitleParenAllCaps')}
                    </Text>
                    {mealDetailLoading ? (
                      <ActivityIndicator color={themeColors.primary} style={{ marginVertical: 20 }} />
                    ) : mealDetailIngredients.length > 0 ? (
                      <View
                        style={[
                          styles.macrosCard,
                          {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                          },
                        ]}
                      >
                        {mealDetailIngredients.map((ing, idx) => (
                          <View
                            key={idx}
                            style={[
                              styles.macroRow,
                              idx === mealDetailIngredients.length - 1 && {
                                borderBottomWidth: 0,
                              },
                            ]}
                          >
                            <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>
                              {ing.ingredient_name}
                            </Text>
                            <Text style={[styles.macroValue, { color: themeColors.textSecondary }]}>
                              {formatIngredientAmount(ing.quantity)}g
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.detailEmptyText, { color: themeColors.textSecondary }]}>
                        {t('nutrition.noIngredientsFound')}
                      </Text>
                    )}
                  </View>
                )}

                {/* Precooked: Origin + Warning */}
                {selectedMealDetail?.itemType === 'ingredient' && selectedMealDetail.category === 'precocinado' && (
                  <>
                    {/* Origin */}
                    {selectedMealDetail.source_primary && (
                      <View style={styles.detailSection}>
                        <Text style={[styles.detailSectionLabel, { color: themeColors.textSecondary }]}>
                          {t('nutrition.sourceAllCaps')}
                        </Text>
                        {selectedMealDetail.source_primary && selectedMealDetail.source_primary.provider && (
                          <Text style={[styles.sourceText, { color: themeColors.textPrimary }]}>
                            {selectedMealDetail.source_primary && selectedMealDetail.source_primary.provider}
                          </Text>
                        )}
                        {selectedMealDetail.source_primary.retrieved_at && (
                          <Text style={[styles.sourceText, { color: themeColors.textSecondary, marginTop: 4 }]}>
                            {t('nutrition.updatedLabel')}{' '}
                            {new Date(selectedMealDetail.source_primary.retrieved_at).toLocaleDateString(
                              getLocaleTag(),
                            )}{' '}
                            {new Date(selectedMealDetail.source_primary.retrieved_at).toLocaleDateString(
                              getLocaleTag(),
                            )}
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Notes */}
                    {getLocalizedIngredientNotes(selectedMealDetail) && (
                      <View style={styles.detailSection}>
                        <Text style={[styles.detailSectionLabel, { color: themeColors.textSecondary }]}>
                          {t('nutrition.notesAllCaps')}
                        </Text>
                        <Text style={[styles.notesText, { color: themeColors.textPrimary }]}>
                          {getLocalizedIngredientNotes(selectedMealDetail)}
                        </Text>
                      </View>
                    )}

                    {/* Warning */}
                    <View style={[styles.detailWarning, { backgroundColor: '#FF950020' }]}>
                      <Text style={[styles.detailWarningText, { color: '#FF9500' }]}>
                        {t('nutrition.onlyMacrosWarning')}
                      </Text>
                      <Text style={[styles.detailWarningSubtext, { color: themeColors.textSecondary }]}>
                        {t('nutrition.checkOfficialSiteForIngredients')}
                      </Text>
                    </View>
                  </>
                )}

                <View style={{ height: 20 }} />
              </ScrollView>

              {/* Select Button */}
              <TouchableOpacity
                style={[styles.detailSelectBtn, { backgroundColor: themeColors.primary }]}
                onPress={async () => {
                  setShowMealDetailModal(false);
                  if (selectedMealDetail) {
                    await handleSelectMealResult(selectedMealDetail);
                  }
                }}
              >
                <Text style={styles.detailSelectBtnText}>{t('nutrition.addToMeal')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Scanner Modal */}
        <Modal visible={showScanner} animationType="slide">
          <FoodScanner onBarcodeDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    // backgroundColor: '#FFF' // Handled inline
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    // color: '#000', // Handled inline
    textAlign: 'center',
  },
  headerDate: {
    fontSize: 12,
    fontWeight: '500',
    // color: '#999', // Handled inline
    textAlign: 'center',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  saveBtn: {
    width: 80,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  saveBtnText: {
    // color: '#007AFF', // Handled inline
    fontWeight: '600',
    fontSize: 17,
  },
  saveBtnTextDisabled: {
    color: '#CCC',
  },

  // Scroll Content
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  openRecipeLibraryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    marginBottom: 14,
  },
  openRecipeLibraryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.25,
  },

  recipeBuilderActionsRow: {
    marginBottom: 14,
    gap: 8,
  },
  recipeBuilderSaveButton: {
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeBuilderSaveButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recipeBuilderSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  recipeBuilderSaveHint: {
    fontSize: 10,
    lineHeight: 17,
  },
  recipePaginationRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  recipePaginationButton: {
    minWidth: 88,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipePaginationButtonDisabled: {
    opacity: 0.55,
  },
  recipePaginationButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  recipePaginationLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Name Section
  nameSection: {
    marginBottom: 24,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: '500',
    // color: '#000', // Handled inline
    // backgroundColor: 'rgba(0,0,0,0.03)', // Handled inline
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  inputWrapper: {
    position: 'relative', // Needed for AI button absolute positioning if used inside
  },
  aiButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    bottom: 8,
    justifyContent: 'center',
  },
  aiButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  aiButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 11,
    marginLeft: 4,
  },
  messageCard: {
    marginTop: 10,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageError: { backgroundColor: 'rgba(255, 59, 48, 0.1)' },
  messageInfo: { backgroundColor: 'rgba(0, 122, 255, 0.1)' },
  messageText: { fontSize: 13, fontWeight: '500' },
  messageTextError: { color: '#FF3B30' },
  messageTextInfo: { color: '#007AFF' },
  savedRecipeIndicator: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  savedRecipeIndicatorText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.25,
    textTransform: 'uppercase',
  },

  // Section Titles
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    // color: '#000', // Handled inline
    marginBottom: 16,
    letterSpacing: -0.3,
  },

  // Ingredients Section
  ingredientsSection: {
    marginBottom: 32,
  },
  ingredientCard: {
    // backgroundColor: '#FFF', // Handled inline
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  ingredientMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 17,
    fontWeight: '600',
    // color: '#000', // Handled inline
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  ingredientMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ingredientAmount: {
    fontSize: 14,
    fontWeight: '600',
    // color: '#007AFF' // Handled inline
  },
  ingredientSource: {
    fontSize: 13,
    // color set inline
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#CCC',
    marginHorizontal: 8,
  },
  ingredientActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    padding: 4,
  },
  actionBtnText: {
    fontWeight: '600',
    fontSize: 14,
    // color set inline
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    borderBottomWidth: 1,
    fontSize: 16,
    padding: 0,
    minWidth: 40,
    textAlign: 'center',
  },
  editUnit: {
    fontSize: 14,
  },

  // Add Section
  addSection: {
    marginTop: 0,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputContainer: {
    marginTop: 4,
  },
  selectedCard: {
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
  },
  selectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  selectedName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  quickAmountChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
  },
  quickAmountChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  amountInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  amountUnit: {
    fontSize: 16,
    fontWeight: '500',
  },
  addBtn: {
    backgroundColor: '#007AFF',
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 15,
  },

  scanButton: {
    height: 160,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.1)',
  },
  scanButtonText: {
    fontWeight: '600',
    fontSize: 15,
  },
  scanLoadingCard: {
    marginTop: 12,
    minHeight: 132,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    gap: 10,
  },
  scanLoadingIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLoadingTitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  scanLoadingSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

  manualForm: {
    gap: 12,
  },
  manualInput: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  manualLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
    marginBottom: 4,
  },
  macrosGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  macroField: {
    flex: 1,
  },
  macroFieldLabel: {
    fontSize: 11,
    marginBottom: 4,
    textAlign: 'center',
  },
  macroFieldInput: {
    height: 40,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 14,
    borderWidth: 1,
  },
  manualAddButton: {
    backgroundColor: '#007AFF', // Could use themeColors.primary in inline or pass via style
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  manualAddButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Meal Search Results
  mealSearchResults: {
    marginTop: 12,
    gap: 8,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  resultsTitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  resultHintBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  resultHintText: {
    fontSize: 11,
    fontWeight: '600',
  },
  mealResultFiltersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  mealFilterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mealResultSection: {
    gap: 8,
    marginTop: 6,
  },
  mealResultSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  mealResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  mealResultInfo: {
    flex: 1,
  },
  mealResultName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  mealResultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mealBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  mealResultMacros: {
    fontSize: 12,
  },
  mealResultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealInfoBtn: {
    padding: 4,
  },
  mealAddBtn: {
    padding: 4,
  },

  // Meal Detail Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
    marginTop: 4,
  },
  modalScrollContent: {
    // Removed fixed height to match IngredientDetailModal behavior
  },
  detailBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 12,
  },
  detailBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailMacros: {
    marginBottom: 16,
  },
  detailMacrosText: {
    fontSize: 13,
  },
  detailSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  detailIngredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  detailIngredientName: {
    fontSize: 14,
    flex: 1,
  },
  detailIngredientQty: {
    fontSize: 14,
    fontWeight: '500',
  },
  detailEmptyText: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 14,
  },
  detailInfoRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  detailInfoLabel: {
    fontSize: 13,
    fontWeight: '500',
    width: 85,
  },
  detailInfoValue: {
    fontSize: 13,
    flex: 1,
  },
  detailNotesSection: {
    marginTop: 12,
  },
  detailNotesText: {
    fontSize: 14,
    marginTop: 4,
    lineHeight: 18,
  },
  detailWarning: {
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  detailWarningText: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  detailWarningSubtext: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
  detailSelectBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  detailSelectBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Unified Modal Styles
  detailMainName: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  detailDescription: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 4,
  },
  detailSection: {
    marginTop: 20,
  },
  detailSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qualityBadge: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityLetter: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
  },
  qualityPercent: {
    fontSize: 16,
    fontWeight: '600',
  },
  macrosCard: {
    borderRadius: 12,
    padding: 16,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  macroLabel: {
    fontSize: 15,
  },
  macroValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  sourceText: {
    fontSize: 14,
    lineHeight: 20,
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  legalDisclaimerContainer: {
    marginTop: 20,
    marginBottom: 10,
    paddingHorizontal: 30,
    opacity: 0.6,
  },
  legalDisclaimerText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
});
