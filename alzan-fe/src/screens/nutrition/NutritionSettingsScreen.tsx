import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { AlzanSwitch } from '../../components/common/AlzanSwitch';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import {
  Download,
  Trash2,
  Calendar,
  FileInput,
  Info,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { usePreferences } from '../../hooks/settings/usePreferences';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useSettingsNotifications, NotificationSettings } from '../../hooks/settings/useSettingsNotifications';
import {
  copySequentialOnActivate,
  copyAlternatingOnActivate,
  checkSequentialConflicts,
  checkAlternatingConflicts,
  deleteFutureWeeks,
  deleteFutureMealLogsByType,
  deleteMealLogsInRange,
} from '../../modules/nutrition/services/dietCopyService';
import { getCatchUpHorizonISO } from '../../modules/nutrition/services/dietCopyPlanner';
import { setUserRecipesVisibility } from '../../modules/nutrition/services/recipeService';
import { generateDietPDF } from '../../modules/nutrition/services/pdfExportService';
import type { WebExportWindow } from '../../modules/nutrition/services/pdfExportService';
import { BlurView } from 'expo-blur';
import { LiquidGlassNativeCard } from '../../components/common/LiquidGlassNativeCard';
import { CalendarDatePickerModal } from '../../components/common/CalendarDatePickerModal';
import { MealType, NutritionSettingsJson, RecipeSearchScope } from '../../types/requests.types';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS } from '../../utils/numericInput';
import { buildTimePickerDate, normalizeNutritionDayRolloverTime } from '../../modules/nutrition/services/nutritionDay';
import {
  DEFAULT_NEXT_MEAL_CUTOFF_HOURS,
  getMaxNextMealCutoffHours,
  normalizeNextMealCutoffHours,
} from '../../modules/nutrition/services/nextMealPlanner';
import { useSetNutritionVacationDates, useVacationDateSet } from '../../modules/nutrition/hooks/useNutritionData';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import type { TranslationKey } from '../../i18n/locales/en';
import type { HomeScreenNavigationProp } from '../../types/navigation.types';
import {
  normalizeShoppingListStartDay,
  type ShoppingListStartDay,
} from '../../modules/nutrition/services/shoppingListPlanner';
import {
  clearFutureVacationDraftSelection,
  getVacationDraftSelectionDiff,
  getVacationNewDraftDateCount,
  mergeLoadedVacationDates,
  toggleVacationDraftDate,
  type VacationDraftSelectionState,
} from '../../modules/nutrition/services/nutritionVacation';
import {
  buildFutureMealDeleteRange,
  getDefaultFutureMealDeleteRange,
  getFutureMealDeleteRangeBounds,
} from '../../modules/nutrition/services/mealDeleteRangePlanner';

// Default meal types (fixed, not editable)
const MEAL_TYPES: MealType[] = ['breakfast', 'almuerzo', 'lunch', 'merienda', 'dinner', 'snack'];

const DEFAULT_ENABLED_MEALS: Record<string, boolean> = {
  breakfast: true,
  almuerzo: true,
  lunch: true,
  merienda: true,
  dinner: true,
  snack: true,
};

const DEFAULT_SNACK_OPTS = {
  treat_as_meal: true,
  show_only_if_content: false,
};

const MAX_EXPORT_RANGE_DAYS = 92;
const VACATION_CALENDAR_RANGE_MONTHS = 12;
const HYDRATION_PRESETS_ML = [1500, 2000, 2500, 3000];
const MAX_DEFAULT_HYDRATION_ML = 10000;

const createEmptyVacationDraftSelection = (): VacationDraftSelectionState => ({
  persistedDates: new Set(),
  draftDates: new Set(),
  addDates: new Set(),
  removeDates: new Set(),
});

const getDefaultExportRange = () => {
  const end = new Date();
  return {
    start: subDays(end, 7),
    end,
  };
};

const getMinExportStartDate = (endDate: Date) => {
  return subDays(endDate, MAX_EXPORT_RANGE_DAYS);
};

const buildMonthGrid = (month: Date): Date[] => {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  let cursor = start;

  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return days;
};

type RecipeDefaultVisibility = 'private' | 'public';
type NutritionSectionInfoKey =
  | 'dailyMeals'
  | 'nutritionDay'
  | 'hydration'
  | 'snacks'
  | 'visualization'
  | 'recipePrivacy'
  | 'recipeSearch'
  | 'autoPlanning'
  | 'data'
  | 'shoppingList'
  | 'nextMeal';

const SHOPPING_LIST_DAYS: Array<{
  value: ShoppingListStartDay;
  labelKey: TranslationKey;
  shortLabelKey: TranslationKey;
}> = [
  { value: 1, labelKey: 'nutrition.shoppingListDayMonday', shortLabelKey: 'nutrition.shoppingListDayMondayShort' },
  { value: 2, labelKey: 'nutrition.shoppingListDayTuesday', shortLabelKey: 'nutrition.shoppingListDayTuesdayShort' },
  {
    value: 3,
    labelKey: 'nutrition.shoppingListDayWednesday',
    shortLabelKey: 'nutrition.shoppingListDayWednesdayShort',
  },
  { value: 4, labelKey: 'nutrition.shoppingListDayThursday', shortLabelKey: 'nutrition.shoppingListDayThursdayShort' },
  { value: 5, labelKey: 'nutrition.shoppingListDayFriday', shortLabelKey: 'nutrition.shoppingListDayFridayShort' },
  { value: 6, labelKey: 'nutrition.shoppingListDaySaturday', shortLabelKey: 'nutrition.shoppingListDaySaturdayShort' },
  { value: 7, labelKey: 'nutrition.shoppingListDaySunday', shortLabelKey: 'nutrition.shoppingListDaySundayShort' },
];

// Radio Option Component
const RadioOption = ({
  label,
  description,
  selected,
  onSelect,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}) => {
  const { colors: themeColors } = useNutritionStyles();
  return (
    <TouchableOpacity style={styles.radioRow} onPress={onSelect} activeOpacity={0.7}>
      <View
        style={[
          styles.radioCircle,
          { borderColor: selected ? themeColors.primary : themeColors.textSecondary },
          selected && { borderColor: themeColors.primary },
        ]}
      >
        {selected && <View style={[styles.radioInner, { backgroundColor: themeColors.primary }]} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.radioLabel, { color: themeColors.textPrimary }]}>{label}</Text>
        {description && <Text style={[styles.radioDesc, { color: themeColors.textSecondary }]}>{description}</Text>}
      </View>
    </TouchableOpacity>
  );
};

const ToggleRow = ({
  label,
  value,
  onValueChange,
  description,
  onInfoPress,
  disabled,
  isLoading,
  time,
  onTimePress,
}: {
  label: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
  description?: string;
  onInfoPress?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  time?: string;
  onTimePress?: () => void;
}) => {
  const { colors: themeColors } = useNutritionStyles();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>{label}</Text>
          {onInfoPress && (
            <TouchableOpacity onPress={onInfoPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Info size={18} color={themeColors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {description && <Text style={[styles.toggleDesc, { color: themeColors.textSecondary }]}>{description}</Text>}
        {time && onTimePress && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}
            onPress={onTimePress}
          >
            <Clock size={14} color={themeColors.primary} />
            <Text style={{ ...typography.caption, color: themeColors.primary, fontWeight: '600' }}>{time}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s }}>
        {isLoading && <ActivityIndicator size="small" color={themeColors.primary} />}
        <AlzanSwitch value={value} onValueChange={onValueChange} disabled={disabled || isLoading} />
      </View>
    </View>
  );
};

export const NutritionSettingsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { preferences, updatePreferences } = usePreferences();
  const { user } = useAuth();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useNutritionStyles();

  // Notifications for Meal Schedule
  const { settings: notifSettings, updateMealReminder } = useSettingsNotifications();

  // Time Picker State
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<keyof NotificationSettings['meals'] | null>(null);
  const [tempDate, setTempDate] = useState(new Date());
  const mealLabels: Record<MealType, string> = {
    breakfast: t('settings.breakfast'),
    almuerzo: t('settings.almuerzo'),
    lunch: t('settings.lunch'),
    merienda: t('settings.merienda'),
    dinner: t('settings.dinner'),
    snack: t('settings.snack'),
  };

  // Direct access to preferences with defaults
  const enabledMeals = preferences?.nutrition_prefs?.enabled_meals || DEFAULT_ENABLED_MEALS;
  const snackOpts = preferences?.nutrition_prefs?.snack_behavior || DEFAULT_SNACK_OPTS;
  const macroDisplay = preferences?.nutrition_prefs?.macro_display || 'per_meal';
  const nutritionDayRolloverTime = normalizeNutritionDayRolloverTime(
    preferences?.nutrition_prefs?.nutrition_day_rollover_time,
  );
  const defaultRecipeVisibility: RecipeDefaultVisibility =
    preferences?.nutrition_prefs?.default_recipe_visibility === 'public' ? 'public' : 'private';
  const recipesArePublicByDefault = defaultRecipeVisibility === 'public';
  const recipeSearchScope: RecipeSearchScope = preferences?.nutrition_prefs?.recipe_search_scope || 'source';
  const shoppingListStartDay = normalizeShoppingListStartDay(preferences?.nutrition_prefs?.shopping_list_start_day);
  const storedNextMealCutoffHours = preferences?.nutrition_prefs?.next_meal_cutoff_hours;
  const maxNextMealCutoffHours = getMaxNextMealCutoffHours(notifSettings?.meals, enabledMeals);
  const nextMealCutoffHours = normalizeNextMealCutoffHours(storedNextMealCutoffHours, maxNextMealCutoffHours);
  const storedDefaultHydrationMl = preferences?.nutrition_prefs?.default_hydration_ml;
  const defaultHydrationMl =
    typeof storedDefaultHydrationMl === 'number' && Number.isFinite(storedDefaultHydrationMl)
      ? Math.max(0, Math.round(storedDefaultHydrationMl))
      : 0;

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStart, setExportStart] = useState<Date>(() => getDefaultExportRange().start);
  const [exportEnd, setExportEnd] = useState<Date>(() => getDefaultExportRange().end);
  const [exportStartInput, setExportStartInput] = useState(() => format(getDefaultExportRange().start, 'yyyy-MM-dd'));
  const [exportEndInput, setExportEndInput] = useState(() => format(getDefaultExportRange().end, 'yyyy-MM-dd'));
  const [isExporting, setIsExporting] = useState(false);
  const [showNutritionDayPicker, setShowNutritionDayPicker] = useState(false);
  const [nutritionDayPickerDate, setNutritionDayPickerDate] = useState(() =>
    buildTimePickerDate(nutritionDayRolloverTime),
  );
  const [nutritionDayRolloverInput, setNutritionDayRolloverInput] = useState(nutritionDayRolloverTime);
  const [defaultHydrationInput, setDefaultHydrationInput] = useState(() =>
    defaultHydrationMl > 0 ? String(defaultHydrationMl) : '',
  );
  const [isDefaultHydrationSaving, setIsDefaultHydrationSaving] = useState(false);
  const [nextMealCutoffInput, setNextMealCutoffInput] = useState(() => String(nextMealCutoffHours));
  const [isNextMealCutoffSaving, setIsNextMealCutoffSaving] = useState(false);
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [vacationCalendarMonth, setVacationCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [vacationCalendarRangeAnchor, setVacationCalendarRangeAnchor] = useState(() => startOfMonth(new Date()));
  const [vacationDraftSelection, setVacationDraftSelection] = useState<VacationDraftSelectionState>(() =>
    createEmptyVacationDraftSelection(),
  );
  const loadedVacationRangesRef = useRef<Set<string>>(new Set());
  const vacationRangeStartMonth = startOfMonth(subMonths(vacationCalendarRangeAnchor, VACATION_CALENDAR_RANGE_MONTHS));
  const vacationRangeEndMonth = startOfMonth(addMonths(vacationCalendarRangeAnchor, VACATION_CALENDAR_RANGE_MONTHS));
  const vacationRangeStart = format(vacationRangeStartMonth, 'yyyy-MM-dd');
  const vacationRangeEnd = format(endOfMonth(vacationRangeEndMonth), 'yyyy-MM-dd');
  const vacationRangeKey = `${vacationRangeStart}_${vacationRangeEnd}`;
  const { data: vacationDates, isLoading: isLoadingVacationDates } = useVacationDateSet(
    vacationRangeStart,
    vacationRangeEnd,
  );
  const setVacationDates = useSetNutritionVacationDates();
  const vacationMonthDays = useMemo(() => buildMonthGrid(vacationCalendarMonth), [vacationCalendarMonth]);
  const draftVacationDates = vacationDraftSelection.draftDates;
  const newDraftVacationDateCount = getVacationNewDraftDateCount(vacationDraftSelection);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmAll, setDeleteConfirmAll] = useState(false);
  const [showDeleteRangeMode, setShowDeleteRangeMode] = useState(false);
  const [deleteStart, setDeleteStart] = useState(new Date());
  const [deleteEnd, setDeleteEnd] = useState(new Date());
  const [activeDeleteDatePicker, setActiveDeleteDatePicker] = useState<'start' | 'end' | null>(null);
  const [showCleanFutureRangeMode, setShowCleanFutureRangeMode] = useState(false);
  const [futureDeleteStart, setFutureDeleteStart] = useState(() => getDefaultFutureMealDeleteRange().start);
  const [futureDeleteEnd, setFutureDeleteEnd] = useState(() => getDefaultFutureMealDeleteRange().end);
  const [activeFutureDeleteDatePicker, setActiveFutureDeleteDatePicker] = useState<'start' | 'end' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Track loading state for each meal toggle
  const [loadingMeals, setLoadingMeals] = useState<Record<string, boolean>>({});

  // UI Loading states
  const [isLoadingCopy, setIsLoadingCopy] = useState(false);
  const [isRecipeVisibilityUpdating, setIsRecipeVisibilityUpdating] = useState(false);

  // Modal states for copy info
  const [showSequentialInfo, setShowSequentialInfo] = useState(false);
  const [showAlternatingInfo, setShowAlternatingInfo] = useState(false);
  const [activeSectionInfo, setActiveSectionInfo] = useState<NutritionSectionInfoKey | null>(null);

  // New states for overwrite protection
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showCleanFutureModal, setShowCleanFutureModal] = useState(false); // Dedicated Clean Future modal
  const [pendingMode, setPendingMode] = useState<'sequential' | 'alternating' | null>(null);

  const parseWebDateInput = (value: string): Date | null => {
    const normalized = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
    const parsed = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return format(parsed, 'yyyy-MM-dd') === normalized ? parsed : null;
  };

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === 'string' && error.trim()) return error;

    if (typeof error === 'object' && error !== null) {
      const maybeError = error as {
        message?: unknown;
        details?: unknown;
        hint?: unknown;
        code?: unknown;
      };
      const parts = [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
        .filter(part => typeof part === 'string' && part.trim())
        .map(part => String(part));

      if (parts.length > 0) {
        return parts.join(' · ');
      }
    }

    return t('nutrition.unknownError');
  };

  // Other settings states
  const [, setShowDietCaloriesOnly] = useState(false);
  const [, setShowTrainingCaloriesOnly] = useState(false);
  const [dietCopyMode, setDietCopyMode] = useState<'none' | 'sequential' | 'alternating'>('none');

  // Load preferences
  useEffect(() => {
    const nutritionPrefs = preferences?.nutrition_prefs;
    if (nutritionPrefs) {
      setShowDietCaloriesOnly(!!nutritionPrefs.show_diet_calories_only);
      setShowTrainingCaloriesOnly(!!nutritionPrefs.show_training_calories_only);
      setDietCopyMode(nutritionPrefs?.copy_mode ?? 'none');
    }
  }, [preferences]);

  useEffect(() => {
    if (!showExportModal) return;
    setExportStartInput(format(exportStart, 'yyyy-MM-dd'));
    setExportEndInput(format(exportEnd, 'yyyy-MM-dd'));
  }, [showExportModal, exportStart, exportEnd]);

  useEffect(() => {
    setNutritionDayRolloverInput(nutritionDayRolloverTime);
  }, [nutritionDayRolloverTime]);

  useEffect(() => {
    setDefaultHydrationInput(defaultHydrationMl > 0 ? String(defaultHydrationMl) : '');
  }, [defaultHydrationMl]);

  useEffect(() => {
    setNextMealCutoffInput(String(nextMealCutoffHours));
  }, [nextMealCutoffHours]);

  useEffect(() => {
    if (!showVacationModal || isLoadingVacationDates) return;
    if (loadedVacationRangesRef.current.has(vacationRangeKey)) return;

    loadedVacationRangesRef.current.add(vacationRangeKey);
    setVacationDraftSelection(prev => mergeLoadedVacationDates(prev, vacationDates));
  }, [showVacationModal, isLoadingVacationDates, vacationDates, vacationRangeKey]);

  const exportMinStartDate = getMinExportStartDate(exportEnd);
  const exportRangeDays = differenceInCalendarDays(exportEnd, exportStart);
  const exportRangeErrorMessage =
    exportRangeDays < 0
      ? t('nutrition.invalidDatesMessage')
      : exportRangeDays > MAX_EXPORT_RANGE_DAYS
        ? t('nutrition.exportRangeMinStartMessage', { date: format(exportMinStartDate, 'yyyy-MM-dd') })
        : null;
  const isExportDisabled = isExporting || !!exportRangeErrorMessage;

  // Helper to update preferences
  const updateNutritionPrefs = (updates: Partial<NutritionSettingsJson>) => {
    return updatePreferences({
      nutrition_prefs: {
        ...preferences?.nutrition_prefs,
        ...updates,
      } as NutritionSettingsJson,
    });
  };

  const applyRecipeVisibilityForUserRecipes = async (makePublic: boolean) => {
    if (!user) return;

    setIsRecipeVisibilityUpdating(true);
    const nextVisibility: RecipeDefaultVisibility = makePublic ? 'public' : 'private';

    try {
      const result = await setUserRecipesVisibility(user.id, nextVisibility);

      if (!result.success) {
        Alert.alert(t('common.error'), t('nutrition.recipeVisibilityUpdateErrorMessage'));
        return;
      }

      await updateNutritionPrefs({ default_recipe_visibility: nextVisibility });

      Alert.alert(
        t('nutrition.recipeVisibilityUpdatedTitle'),
        makePublic
          ? t('nutrition.recipeVisibilityUpdatedPublicMessage')
          : t('nutrition.recipeVisibilityUpdatedPrivateMessage'),
      );
    } catch (error) {
      console.error('[NutritionSettings] Error applying recipe visibility setting:', error);
      Alert.alert(t('common.error'), t('nutrition.recipeVisibilityUpdateErrorMessage'));
    } finally {
      setIsRecipeVisibilityUpdating(false);
    }
  };

  const handleRecipeVisibilityToggle = (nextValue: boolean) => {
    if (isRecipeVisibilityUpdating || nextValue === recipesArePublicByDefault) return;

    Alert.alert(
      t('nutrition.recipeVisibilityConfirmTitle'),
      nextValue
        ? t('nutrition.recipeVisibilityConfirmPublicMessage')
        : t('nutrition.recipeVisibilityConfirmPrivateMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('nutrition.confirmAction'),
          onPress: () => {
            void applyRecipeVisibilityForUserRecipes(nextValue);
          },
        },
      ],
    );
  };

  // Delete future meal logs for a specific meal type (from TODAY onwards)
  const deleteFutureMealData = async (mealType: MealType) => {
    if (!user) return;

    const result = await deleteFutureMealLogsByType(user.id, mealType);
    if (!result.success) {
      console.error('[NutritionSettings] Error deleting future meal data:', result.error);
    }
  };

  const toggleMeal = async (id: MealType, value: boolean) => {
    console.log(`[NutritionSettings] Toggle meal: ${id} = ${value}`);

    // Update preferences immediately (visual change)
    const updated = { ...enabledMeals, [id]: value };
    updateNutritionPrefs({ enabled_meals: updated });

    // If disabling, clean up FUTURE data only
    if (!value) {
      setLoadingMeals(prev => ({ ...prev, [id]: true }));
      // Run in background but track completion for loading state
      deleteFutureMealData(id).finally(() => {
        setLoadingMeals(prev => ({ ...prev, [id]: false }));
      });
    }
  };

  const toggleSnackOpt = (key: keyof typeof snackOpts) => {
    console.log(`[NutritionSettings] Toggle snack option: ${String(key)}`);
    const updated = { ...snackOpts, [key]: !snackOpts[key] };
    updateNutritionPrefs({ snack_behavior: updated });
  };

  const setDisplayOption = (option: 'per_meal' | 'daily_total') => {
    console.log(`[NutritionSettings] Set display option: ${option}`);
    updateNutritionPrefs({ macro_display: option });
  };

  const setRecipeSearchScope = (scope: RecipeSearchScope) => {
    if (scope === recipeSearchScope) return;
    updateNutritionPrefs({ recipe_search_scope: scope });
  };

  const openNutritionDayPicker = () => {
    setNutritionDayPickerDate(buildTimePickerDate(nutritionDayRolloverTime));
    setShowNutritionDayPicker(true);
  };

  const handleNutritionDayWebInputChange = (value: string) => {
    setNutritionDayRolloverInput(value.replace(/[^\d:]/g, '').slice(0, 5));
  };

  const commitNutritionDayWebInput = () => {
    const normalized = normalizeNutritionDayRolloverTime(nutritionDayRolloverInput);
    if (normalized !== nutritionDayRolloverInput) {
      setNutritionDayRolloverInput(nutritionDayRolloverTime);
      return;
    }

    if (normalized !== nutritionDayRolloverTime) {
      updateNutritionPrefs({ nutrition_day_rollover_time: normalized });
    }
  };

  const handleDefaultHydrationInputChange = (value: string) => {
    setDefaultHydrationInput(value.replace(/[^\d]/g, '').slice(0, 5));
  };

  const getHydrationDraftMl = () => {
    const parsed = Number(defaultHydrationInput);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(MAX_DEFAULT_HYDRATION_ML, Math.max(0, Math.round(parsed)));
  };

  const saveDefaultHydration = async () => {
    const nextDefaultHydrationMl = getHydrationDraftMl();
    if (nextDefaultHydrationMl === defaultHydrationMl || isDefaultHydrationSaving) return;

    setIsDefaultHydrationSaving(true);
    try {
      await updateNutritionPrefs({ default_hydration_ml: nextDefaultHydrationMl });
      setDefaultHydrationInput(nextDefaultHydrationMl > 0 ? String(nextDefaultHydrationMl) : '');
    } catch (error) {
      console.error('[NutritionSettings] Error saving default hydration:', error);
      Alert.alert(t('common.error'), t('nutrition.defaultHydrationSaveError'));
    } finally {
      setIsDefaultHydrationSaving(false);
    }
  };

  const handleNextMealCutoffInputChange = (value: string) => {
    const sanitized = value.replace(',', '.').replace(/[^\d.]/g, '');
    const [whole, decimals] = sanitized.split('.');
    setNextMealCutoffInput(decimals === undefined ? whole.slice(0, 5) : `${whole.slice(0, 5)}.${decimals.slice(0, 2)}`);
  };

  const getNextMealCutoffDraftHours = () => {
    const parsed = Number(nextMealCutoffInput);
    if (!Number.isFinite(parsed)) return DEFAULT_NEXT_MEAL_CUTOFF_HOURS;

    return normalizeNextMealCutoffHours(parsed, maxNextMealCutoffHours);
  };

  const saveNextMealCutoff = async () => {
    const nextHours = getNextMealCutoffDraftHours();
    if (nextHours === nextMealCutoffHours || isNextMealCutoffSaving) return;

    setIsNextMealCutoffSaving(true);
    try {
      await updateNutritionPrefs({ next_meal_cutoff_hours: nextHours });
      setNextMealCutoffInput(String(nextHours));
    } catch (error) {
      console.error('[NutritionSettings] Error saving next meal cutoff:', error);
      Alert.alert(t('common.error'), t('nutrition.nextMealTimingSaveError'));
    } finally {
      setIsNextMealCutoffSaving(false);
    }
  };

  const handleNutritionDayRolloverChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowNutritionDayPicker(false);
    }

    if (!selectedDate) return;

    setNutritionDayPickerDate(selectedDate);
    const hours = selectedDate.getHours().toString().padStart(2, '0');
    const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
    updateNutritionPrefs({ nutrition_day_rollover_time: `${hours}:${minutes}` });
  };

  const closeNutritionDayPicker = () => {
    setShowNutritionDayPicker(false);
  };

  // Export action
  const handleExport = async () => {
    try {
      if (exportRangeErrorMessage) return;
      // Validate max 3 months
      const diffMs = exportEnd.getTime() - exportStart.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > 92) {
        Alert.alert(t('nutrition.exportRangeTooLongTitle'), t('nutrition.exportRangeTooLongMessage'));
        return;
      }
      if (diffDays < 0) {
        Alert.alert(t('nutrition.invalidDatesTitle'), t('nutrition.invalidDatesMessage'));
        return;
      }

      const exportStartDate = format(exportStart, 'yyyy-MM-dd');
      const exportEndDate = format(exportEnd, 'yyyy-MM-dd');
      const webPrintWindow: WebExportWindow | null =
        Platform.OS === 'web'
          ? ((
              globalThis as {
                open?: (url?: string, target?: string) => WebExportWindow | null;
              }
            ).open?.('', '_blank') ?? null)
          : null;

      console.log(`[NutritionSettings] Export requested: ${exportStartDate} to ${exportEndDate}`);
      setShowExportModal(false);
      setIsExporting(true);

      await generateDietPDF({
        startDate: exportStartDate,
        endDate: exportEndDate,
        user: {
          id: user?.id || '',
          display_name: user?.user_metadata?.display_name || user?.email,
        },
        webPrintWindow,
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      const isNoDataError =
        message.includes(t('nutrition.pdfNoRecordsInRange')) ||
        message.includes('No hay registros') ||
        message.includes('No records');
      console.error('Export error:', error);
      const errorMessage = isNoDataError
        ? t('nutrition.pdfNoRecordsInRange')
        : Platform.OS === 'web'
          ? `${t('nutrition.pdfGenerateRetry')}\n${message}`
          : `${t('nutrition.pdfGenerateErrorPrefix')} ${message}`;
      Alert.alert(t('common.error'), errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const applyExportStartDate = (nextStart: Date) => {
    setExportStart(nextStart);
  };

  const applyExportEndDate = (nextEnd: Date) => {
    setExportEnd(nextEnd);
  };

  const openExportModal = () => {
    const defaultRange = getDefaultExportRange();
    setExportStart(defaultRange.start);
    setExportEnd(defaultRange.end);
    setExportStartInput(format(defaultRange.start, 'yyyy-MM-dd'));
    setExportEndInput(format(defaultRange.end, 'yyyy-MM-dd'));
    setShowExportModal(true);
  };

  const openVacationModal = () => {
    const initialMonth = startOfMonth(new Date());
    loadedVacationRangesRef.current = new Set();
    setVacationDraftSelection(createEmptyVacationDraftSelection());
    setVacationCalendarMonth(initialMonth);
    setVacationCalendarRangeAnchor(initialMonth);
    setShowVacationModal(true);
  };

  const moveVacationCalendarMonth = (direction: -1 | 1) => {
    setVacationCalendarMonth(prev => {
      const nextMonth = direction === 1 ? addMonths(prev, 1) : subMonths(prev, 1);
      const nextMonthTime = startOfMonth(nextMonth).getTime();
      const rangeStartTime = vacationRangeStartMonth.getTime();
      const rangeEndTime = vacationRangeEndMonth.getTime();

      if (nextMonthTime < rangeStartTime || nextMonthTime > rangeEndTime) {
        setVacationCalendarRangeAnchor(startOfMonth(nextMonth));
      }

      return nextMonth;
    });
  };

  const toggleVacationDate = (dateKey: string) => {
    setVacationDraftSelection(prev => toggleVacationDraftDate(prev, dateKey));
  };

  const clearVacationSelection = () => {
    setVacationDraftSelection(prev => clearFutureVacationDraftSelection(prev, format(new Date(), 'yyyy-MM-dd')));
  };

  const saveVacationSelection = async () => {
    const { addDates, removeDates } = getVacationDraftSelectionDiff(vacationDraftSelection);

    try {
      await setVacationDates.mutateAsync({ addDates, removeDates });
      setShowVacationModal(false);
    } catch (error) {
      console.error('[NutritionSettings] Error saving vacation days:', error);
      Alert.alert(t('common.error'), t('nutrition.vacationSaveError'));
    }
  };

  // Check for conflicts before applying copy mode
  const handleCopyModeChange = async (mode: 'none' | 'sequential' | 'alternating') => {
    // Si hacemos clic en la opción que ya está activa
    if (mode === dietCopyMode) {
      if (mode !== 'none') {
        // Intentar desactivar
        await handleApplyCopyMode('none', false);
      }
      return;
    }

    // SI VAMOS A DESACTIVAR ('none')
    if (mode === 'none') {
      if (!user) {
        await handleApplyCopyMode('none', false);
        return;
      }

      // Check if future data exists
      // We can use checkSequentialConflicts to check if W+1...W+3 has data
      // Or just use our new logic. Let's use checkSequentialConflicts as a proxy for "Has Future Data"
      // or check manually.
      const hasFutureData = await checkSequentialConflicts(user.id); // Checks W+1, W+2, W+3

      if (hasFutureData) {
        setShowDeactivateModal(true);
      } else {
        await handleApplyCopyMode('none', false);
      }
      return;
    }

    setPendingMode(mode);
    setIsLoadingCopy(true);

    try {
      let hasConflict = false;
      if (user) {
        if (mode === 'sequential') {
          hasConflict = await checkSequentialConflicts(user.id);
        } else if (mode === 'alternating') {
          hasConflict = await checkAlternatingConflicts(user.id);
        }
      }

      if (hasConflict) {
        setIsLoadingCopy(false);
        setShowOverwriteModal(true);
      } else {
        await handleApplyCopyMode(mode, false);
      }
    } catch (err) {
      console.error('Error checking conflicts:', err);
      setIsLoadingCopy(false);
    }
  };

  const handleDeactivate = async (deleteFuture: boolean) => {
    setIsLoadingCopy(true);
    setShowDeactivateModal(false);

    if (user) {
      // 1. Set mode to none
      await updateNutritionPrefs({ copy_mode: 'none' });
      setDietCopyMode('none');

      // 2. Delete future if requested
      if (deleteFuture) {
        await deleteFutureWeeks(user.id);
      }
    }
    setIsLoadingCopy(false);
  };

  const handleCleanFuture = async () => {
    setIsLoadingCopy(true);
    setShowCleanFutureModal(false);
    setShowCleanFutureRangeMode(false);
    setActiveFutureDeleteDatePicker(null);

    if (user) {
      await deleteFutureWeeks(user.id);
      Alert.alert(t('nutrition.futureCleanTitle'), t('nutrition.futureCleanMessage'));
    }
    setIsLoadingCopy(false);
  };

  const openCleanFutureModal = () => {
    const defaultRange = getDefaultFutureMealDeleteRange();
    setFutureDeleteStart(defaultRange.start);
    setFutureDeleteEnd(defaultRange.end);
    setShowCleanFutureRangeMode(false);
    setActiveFutureDeleteDatePicker(null);
    setShowCleanFutureModal(true);
  };

  const closeCleanFutureModal = () => {
    setShowCleanFutureModal(false);
    setShowCleanFutureRangeMode(false);
    setActiveFutureDeleteDatePicker(null);
  };

  const handleCleanFutureRange = () => {
    let range: { start: string; end: string };
    try {
      range = buildFutureMealDeleteRange(futureDeleteStart, futureDeleteEnd);
    } catch {
      Alert.alert(t('common.error'), t('nutrition.futureDeleteRangeInvalidMessage'));
      return;
    }

    Alert.alert(
      t('nutrition.confirmDeletionTitle'),
      t('nutrition.confirmDeleteFutureRangeMessage', {
        start: format(futureDeleteStart, 'dd/MM/yyyy'),
        end: format(futureDeleteEnd, 'dd/MM/yyyy'),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user || isLoadingCopy) return;

            setIsLoadingCopy(true);
            closeCleanFutureModal();
            try {
              const result = await deleteMealLogsInRange(user.id, range);
              if (!result.success) {
                Alert.alert(t('common.error'), result.error || t('nutrition.deleteRecordsErrorMessage'));
                return;
              }

              Alert.alert(
                t('nutrition.deletedTitle'),
                result.deletedCount > 0
                  ? t('nutrition.futureRangeDeletedSuccessfully')
                  : t('nutrition.noRecordsToDeleteMessage'),
              );
            } catch (error) {
              Alert.alert(t('common.error'), getErrorMessage(error));
            } finally {
              setIsLoadingCopy(false);
            }
          },
        },
      ],
    );
  };

  const handleApplyCopyMode = async (mode: typeof dietCopyMode, overwrite: boolean) => {
    setIsLoadingCopy(true);
    setDietCopyMode(mode);

    if (user) {
      // Initialize the catch-up pointer to the current horizon so the next app
      // open doesn't redundantly re-process the weeks we just filled.
      const prefUpdates: Partial<NutritionSettingsJson> = { copy_mode: mode };
      if (mode !== 'none') prefUpdates.last_visible_week = getCatchUpHorizonISO();
      await updateNutritionPrefs(prefUpdates);

      if (mode === 'sequential') {
        await copySequentialOnActivate(user.id, overwrite);
      } else if (mode === 'alternating') {
        await copyAlternatingOnActivate(user.id, overwrite);
      }
    }

    setIsLoadingCopy(false);
    setPendingMode(null);
  };

  // Delete actions
  const closeDeleteModals = () => {
    setShowDeleteModal(false);
    setShowDeleteRangeMode(false);
    setDeleteConfirmAll(false);
  };

  // Actually deletes meal logs (and their items) in the given inclusive range.
  // Omit start/end to delete everything for the user.
  const executeDelete = async (range: { start?: Date; end?: Date }, successMessage: string) => {
    if (!user || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteMealLogsInRange(user.id, {
        start: range.start ? format(range.start, 'yyyy-MM-dd') : undefined,
        end: range.end ? format(range.end, 'yyyy-MM-dd') : undefined,
      });

      if (!result.success) {
        Alert.alert(t('common.error'), result.error || t('nutrition.deleteRecordsErrorMessage'));
        return;
      }

      closeDeleteModals();
      Alert.alert(
        t('nutrition.deletedTitle'),
        result.deletedCount > 0 ? successMessage : t('nutrition.noRecordsToDeleteMessage'),
      );
    } catch (error) {
      Alert.alert(t('common.error'), getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteOption = (option: 'today' | '7days' | 'range' | 'all') => {
    if (option === 'all') {
      setDeleteConfirmAll(true);
      return;
    }

    if (option === 'range') {
      setShowDeleteRangeMode(true);
      return;
    }

    const today = new Date();
    const ranges: Record<'today' | '7days', { start: Date; end: Date }> = {
      today: { start: today, end: today },
      '7days': { start: subDays(today, 6), end: today },
    };
    const labels: Record<'today' | '7days', string> = {
      today: t('nutrition.recordsToday'),
      '7days': t('nutrition.recordsLast7Days'),
    };

    Alert.alert(
      t('nutrition.confirmDeletionTitle'),
      t('nutrition.confirmDeleteRecordsMessage', { target: labels[option] }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void executeDelete(ranges[option], t('nutrition.recordsDeletedSuccessfully'));
          },
        },
      ],
    );
  };

  const handleDeleteRange = () => {
    Alert.alert(
      t('nutrition.confirmDeletionTitle'),
      t('nutrition.confirmDeleteRangeMessage', {
        start: format(deleteStart, 'dd/MM/yyyy'),
        end: format(deleteEnd, 'dd/MM/yyyy'),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void executeDelete({ start: deleteStart, end: deleteEnd }, t('nutrition.recordsRangeDeletedSuccessfully'));
          },
        },
      ],
    );
  };

  const confirmDeleteAll = () => {
    void executeDelete({}, t('nutrition.allRecordsDeleted'));
  };

  // Time Picker Handlers
  const handleOpenTimePicker = (mealId: string, currentTimeStr: string) => {
    // Map string mealId (enabled_meals keys) to NotificationSettings key
    // assuming 'almuerzo' maps to 'almuerzo', etc.
    const mealKey = mealId as keyof NotificationSettings['meals'];

    if (!notifSettings?.meals?.[mealKey]) {
      console.warn('Meal key not found in notification settings:', mealKey);
      return;
    }

    setSelectedMeal(mealKey);
    const [hours, minutes] = currentTimeStr.split(':').map(Number);
    const now = new Date();
    now.setHours(hours, minutes, 0, 0);
    setTempDate(now);
    setShowTimePicker(true);
  };

  const handleTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }

    if (selectedDate && selectedMeal) {
      setTempDate(selectedDate);
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const newTime = `${hours}:${minutes}`;

      // Save immediately
      updateMealReminder(selectedMeal, { time: newTime });
    }
  };

  const closePicker = () => {
    setShowTimePicker(false);
    setSelectedMeal(null);
  };

  const sectionInfoTextKeys = {
    dailyMeals: {
      titleKey: 'nutrition.dailyMealsInfoModalTitle',
      bodyKey: 'nutrition.dailyMealsInfoModalBody',
    },
    nextMeal: {
      titleKey: 'nutrition.nextMealTimingInfoModalTitle',
      bodyKey: 'nutrition.nextMealTimingInfoModalBody',
    },
    nutritionDay: {
      titleKey: 'nutrition.nutritionDayInfoModalTitle',
      bodyKey: 'nutrition.nutritionDayInfoModalBody',
    },
    shoppingList: {
      titleKey: 'nutrition.shoppingListInfoModalTitle',
      bodyKey: 'nutrition.shoppingListInfoModalBody',
    },
    hydration: {
      titleKey: 'nutrition.defaultHydrationInfoModalTitle',
      bodyKey: 'nutrition.defaultHydrationInfoModalBody',
    },
    snacks: {
      titleKey: 'nutrition.snacksInfoModalTitle',
      bodyKey: 'nutrition.snacksInfoModalBody',
    },
    visualization: {
      titleKey: 'nutrition.visualizationInfoModalTitle',
      bodyKey: 'nutrition.visualizationInfoModalBody',
    },
    recipePrivacy: {
      titleKey: 'nutrition.recipePrivacyInfoModalTitle',
      bodyKey: 'nutrition.recipePrivacyInfoModalBody',
    },
    recipeSearch: {
      titleKey: 'nutrition.recipeSearchInfoModalTitle',
      bodyKey: 'nutrition.recipeSearchInfoModalBody',
    },
    autoPlanning: {
      titleKey: 'nutrition.autoPlanningInfoModalTitle',
      bodyKey: 'nutrition.autoPlanningInfoModalBody',
    },
    data: {
      titleKey: 'nutrition.dataInfoModalTitle',
      bodyKey: 'nutrition.dataInfoModalBody',
    },
  } as const satisfies Record<NutritionSectionInfoKey, { titleKey: string; bodyKey: string }>;

  const renderSectionTitle = (label: string, sectionKey: NutritionSectionInfoKey) => (
    <TouchableOpacity activeOpacity={0.8} onPress={() => setActiveSectionInfo(sectionKey)}>
      <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );

  const hydrationDraftMl = getHydrationDraftMl();
  const isDefaultHydrationSaveDisabled = isDefaultHydrationSaving || hydrationDraftMl === defaultHydrationMl;
  const futureDeleteBounds = getFutureMealDeleteRangeBounds();

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Comidas del día */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.dailyMealsTitle'), 'dailyMeals')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              {MEAL_TYPES.filter(meal => meal !== 'snack').map((meal, index) => {
                const mealKey = meal as keyof NotificationSettings['meals'];
                const time = notifSettings?.meals?.[mealKey]?.time;

                return (
                  <React.Fragment key={meal}>
                    {index > 0 && <View style={[styles.separator, { backgroundColor: themeColors.border }]} />}
                    <ToggleRow
                      label={mealLabels[meal]}
                      value={enabledMeals[meal] ?? true}
                      onValueChange={val => toggleMeal(meal, val)}
                      isLoading={loadingMeals[meal]}
                      time={time}
                      onTimePress={time ? () => handleOpenTimePicker(meal, time) : undefined}
                    />
                  </React.Fragment>
                );
              })}
            </View>
          </View>

          {/* 2. Margen de siguiente comida */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.nextMealTimingTitle'), 'nextMeal')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <View style={styles.hydrationSettingContent}>
                <View style={styles.hydrationSettingHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>
                      {t('nutrition.nextMealTimingLabel')}
                    </Text>
                    <Text style={[styles.toggleDesc, { color: themeColors.textSecondary }]}>
                      {t('nutrition.nextMealTimingHint', { max: maxNextMealCutoffHours })}
                    </Text>
                  </View>
                </View>

                <View style={styles.hydrationInputRow}>
                  <View
                    style={[
                      styles.hydrationInputShell,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                        borderColor: themeColors.border,
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.hydrationInput, { color: themeColors.textPrimary }]}
                      value={nextMealCutoffInput}
                      onChangeText={handleNextMealCutoffInputChange}
                      placeholder={t('nutrition.nextMealTimingPlaceholder')}
                      placeholderTextColor={themeColors.textSecondary}
                      {...DECIMAL_INPUT_PROPS}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={5}
                    />
                    <Text style={[styles.hydrationInputUnit, { color: themeColors.textSecondary }]}>h</Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.hydrationSaveButton,
                      {
                        backgroundColor:
                          isNextMealCutoffSaving || getNextMealCutoffDraftHours() === nextMealCutoffHours
                            ? themeColors.border
                            : themeColors.primary,
                      },
                    ]}
                    onPress={saveNextMealCutoff}
                    disabled={isNextMealCutoffSaving || getNextMealCutoffDraftHours() === nextMealCutoffHours}
                    activeOpacity={0.8}
                  >
                    {isNextMealCutoffSaving ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.hydrationSaveButtonText}>{t('common.save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          {/* 3. Día nutricional */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.nutritionDayTitle'), 'nutritionDay')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <TouchableOpacity
                style={styles.timeSettingRow}
                onPress={Platform.OS === 'web' ? undefined : openNutritionDayPicker}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>
                    {t('nutrition.nutritionDayRolloverLabel')}
                  </Text>
                  <Text style={[styles.toggleDesc, { color: themeColors.textSecondary }]}>
                    {t('nutrition.nutritionDayRolloverHint')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.timeSettingPill,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                  ]}
                >
                  <Clock size={15} color={themeColors.primary} strokeWidth={2.4} />
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.timeSettingInput, { color: themeColors.primary }]}
                      value={nutritionDayRolloverInput}
                      onChangeText={handleNutritionDayWebInputChange}
                      onBlur={commitNutritionDayWebInput}
                      onSubmitEditing={commitNutritionDayWebInput}
                      placeholder="03:00"
                      placeholderTextColor={themeColors.textSecondary}
                      keyboardType="numbers-and-punctuation"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  ) : (
                    <Text style={[styles.timeSettingText, { color: themeColors.primary }]}>
                      {nutritionDayRolloverTime}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. Lista de la compra */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.shoppingListStartDayTitle'), 'shoppingList')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <View style={styles.shoppingListSettingContent}>
                <View>
                  <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>
                    {t('nutrition.shoppingListStartDayLabel')}
                  </Text>
                  <Text style={[styles.toggleDesc, { color: themeColors.textSecondary }]}>
                    {t('nutrition.shoppingListStartDayHint')}
                  </Text>
                </View>
                <View style={styles.shoppingDayGrid}>
                  {SHOPPING_LIST_DAYS.map(day => {
                    const isSelected = day.value === shoppingListStartDay;
                    return (
                      <TouchableOpacity
                        key={day.value}
                        style={[
                          styles.shoppingDayButton,
                          {
                            borderColor: isSelected ? themeColors.primary : themeColors.border,
                            backgroundColor: isSelected ? themeColors.primary + '14' : 'transparent',
                          },
                        ]}
                        onPress={() => updateNutritionPrefs({ shopping_list_start_day: day.value })}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={t(day.labelKey)}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text
                          style={[
                            styles.shoppingDayButtonText,
                            { color: isSelected ? themeColors.primary : themeColors.textSecondary },
                          ]}
                        >
                          {t(day.shortLabelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>

          {/* 4. Hidratación */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.defaultHydrationTitle'), 'hydration')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <View style={styles.hydrationSettingContent}>
                <View style={styles.hydrationSettingHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>
                      {t('nutrition.defaultHydrationLabel')}
                    </Text>
                    <Text style={[styles.toggleDesc, { color: themeColors.textSecondary }]}>
                      {t('nutrition.defaultHydrationHint')}
                    </Text>
                  </View>
                </View>

                <View style={styles.hydrationInputRow}>
                  <View
                    style={[
                      styles.hydrationInputShell,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                        borderColor: themeColors.border,
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.hydrationInput, { color: themeColors.textPrimary }]}
                      value={defaultHydrationInput}
                      onChangeText={handleDefaultHydrationInputChange}
                      placeholder={t('nutrition.defaultHydrationPlaceholder')}
                      placeholderTextColor={themeColors.textSecondary}
                      {...INTEGER_INPUT_PROPS}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={5}
                    />
                    <Text style={[styles.hydrationInputUnit, { color: themeColors.textSecondary }]}>
                      {t('nutrition.ml')}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.hydrationSaveButton,
                      {
                        backgroundColor: isDefaultHydrationSaveDisabled ? themeColors.border : themeColors.primary,
                      },
                    ]}
                    onPress={saveDefaultHydration}
                    disabled={isDefaultHydrationSaveDisabled}
                    activeOpacity={0.8}
                  >
                    {isDefaultHydrationSaving ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.hydrationSaveButtonText}>{t('common.save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.hydrationPresetRow}>
                  {HYDRATION_PRESETS_ML.map(presetMl => {
                    const selected = hydrationDraftMl === presetMl;
                    return (
                      <TouchableOpacity
                        key={presetMl}
                        style={[
                          styles.hydrationPresetChip,
                          {
                            borderColor: selected ? themeColors.primary : themeColors.border,
                            backgroundColor: selected
                              ? isDark
                                ? 'rgba(59, 130, 246, 0.18)'
                                : 'rgba(0, 122, 255, 0.1)'
                              : 'transparent',
                          },
                        ]}
                        onPress={() => setDefaultHydrationInput(String(presetMl))}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.hydrationPresetText,
                            { color: selected ? themeColors.primary : themeColors.textSecondary },
                          ]}
                        >
                          {presetMl}
                          {t('nutrition.ml')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
              {t('nutrition.vacationModalTitle').toUpperCase()}
            </Text>
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <TouchableOpacity style={styles.actionRow} onPress={openVacationModal} activeOpacity={0.7}>
                <Calendar size={20} color={themeColors.primary} />
                <View style={styles.actionCopy}>
                  <Text style={[styles.actionText, { color: themeColors.textPrimary }]}>
                    {t('nutrition.manageVacationDays')}
                  </Text>
                  <Text style={[styles.actionDescription, { color: themeColors.textSecondary }]}>
                    {t('nutrition.vacationModalSubtitle')}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. Snacks */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.snacksAllCaps'), 'snacks')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <ToggleRow
                label={t('nutrition.enableSnacks')}
                value={enabledMeals?.snack ?? true}
                onValueChange={val => toggleMeal('snack', val)}
                isLoading={loadingMeals['snack']}
              />
              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />
              <ToggleRow
                label={t('nutrition.minimizeSnacks')}
                description={t('nutrition.minimizeSnacksHint')}
                value={snackOpts.show_only_if_content}
                onValueChange={() => toggleSnackOpt('show_only_if_content')}
              />
            </View>
          </View>

          {/* 4. Visualización nutricional */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.visualizationTitle'), 'visualization')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <RadioOption
                label={t('nutrition.detailedView')}
                description={t('nutrition.detailedHint')}
                selected={macroDisplay === 'per_meal'}
                onSelect={() => setDisplayOption('per_meal')}
              />
              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />
              <RadioOption
                label={t('nutrition.summaryView')}
                description={t('nutrition.summaryHint')}
                selected={macroDisplay === 'daily_total'}
                onSelect={() => setDisplayOption('daily_total')}
              />
            </View>
          </View>

          {/* 5. Recipe privacy */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.recipePrivacyTitle'), 'recipePrivacy')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <ToggleRow
                label={t('nutrition.recipeDefaultPublicLabel')}
                description={t('nutrition.recipeDefaultPublicHint')}
                value={recipesArePublicByDefault}
                onValueChange={handleRecipeVisibilityToggle}
                isLoading={isRecipeVisibilityUpdating}
              />
            </View>
          </View>

          {/* 6. Recipe search scope */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.recipeSearchScopeTitle'), 'recipeSearch')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <RadioOption
                label={t('nutrition.recipeSearchScopeSourceLabel')}
                description={t('nutrition.recipeSearchScopeSourceHint')}
                selected={recipeSearchScope === 'source'}
                onSelect={() => setRecipeSearchScope('source')}
              />
              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />
              <RadioOption
                label={t('nutrition.recipeSearchScopeAllLabel')}
                description={t('nutrition.recipeSearchScopeAllHint')}
                selected={recipeSearchScope === 'all'}
                onSelect={() => setRecipeSearchScope('all')}
              />
              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />
              <RadioOption
                label={t('nutrition.recipeSearchScopeUsersLabel')}
                description={t('nutrition.recipeSearchScopeUsersHint')}
                selected={recipeSearchScope === 'users'}
                onSelect={() => setRecipeSearchScope('users')}
              />
              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />
              <RadioOption
                label={t('nutrition.recipeSearchScopeSavedLabel')}
                description={t('nutrition.recipeSearchScopeSavedHint')}
                selected={recipeSearchScope === 'saved'}
                onSelect={() => setRecipeSearchScope('saved')}
              />
              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />
              <RadioOption
                label={t('nutrition.recipeSearchScopeFavoritesLabel')}
                description={t('nutrition.recipeSearchScopeFavoritesHint')}
                selected={recipeSearchScope === 'favorites'}
                onSelect={() => setRecipeSearchScope('favorites')}
              />
            </View>
          </View>

          {/* 7. Auto-copy diet */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.autoPlanningTitle'), 'autoPlanning')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <TouchableOpacity
                style={styles.copyModeRow}
                onPress={() => !isLoadingCopy && handleCopyModeChange('sequential')}
                activeOpacity={0.7}
              >
                <View style={styles.copyModeLeft}>
                  <View
                    style={[
                      styles.radioCircle,
                      {
                        borderColor: dietCopyMode === 'sequential' ? themeColors.primary : themeColors.textSecondary,
                      },
                      dietCopyMode === 'sequential' && { borderColor: themeColors.primary },
                    ]}
                  >
                    {dietCopyMode === 'sequential' && (
                      <View style={[styles.radioInner, { backgroundColor: themeColors.primary }]} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>
                      {t('nutrition.copyWeekly')}
                    </Text>
                    <Text style={[styles.toggleDesc, { color: themeColors.textSecondary }]}>
                      {t('nutrition.copyWeeklyShortDesc')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={e => {
                    e.stopPropagation();
                    setShowSequentialInfo(true);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.infoButton}
                >
                  <Info size={20} color={themeColors.primary} />
                </TouchableOpacity>
              </TouchableOpacity>

              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />

              <TouchableOpacity
                style={styles.copyModeRow}
                onPress={() => !isLoadingCopy && handleCopyModeChange('alternating')}
                activeOpacity={0.7}
              >
                <View style={styles.copyModeLeft}>
                  <View
                    style={[
                      styles.radioCircle,
                      {
                        borderColor: dietCopyMode === 'alternating' ? themeColors.primary : themeColors.textSecondary,
                      },
                      dietCopyMode === 'alternating' && { borderColor: themeColors.primary },
                    ]}
                  >
                    {dietCopyMode === 'alternating' && (
                      <View style={[styles.radioInner, { backgroundColor: themeColors.primary }]} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>
                      {t('nutrition.copyAlternate')}
                    </Text>
                    <Text style={[styles.toggleDesc, { color: themeColors.textSecondary }]}>
                      {t('nutrition.evenOddWeeksIndependent')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={e => {
                    e.stopPropagation();
                    setShowAlternatingInfo(true);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.infoButton}
                >
                  <Info size={20} color={themeColors.primary} />
                </TouchableOpacity>
              </TouchableOpacity>

              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />

              <TouchableOpacity
                style={styles.copyModeRow}
                onPress={() => !isLoadingCopy && handleCopyModeChange('none')} // 'none' explicitly
                activeOpacity={0.7}
              >
                <View style={styles.copyModeLeft}>
                  <View
                    style={[
                      styles.radioCircle,
                      {
                        borderColor: dietCopyMode === 'none' ? themeColors.primary : themeColors.textSecondary,
                      },
                      dietCopyMode === 'none' && { borderColor: themeColors.primary },
                    ]}
                  >
                    {dietCopyMode === 'none' && (
                      <View style={[styles.radioInner, { backgroundColor: themeColors.primary }]} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>
                      {t('nutrition.noAutoPlanning')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {isLoadingCopy && (
                <View
                  style={[
                    styles.loadingOverlay,
                    {
                      backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)',
                      borderTopColor: themeColors.border,
                    },
                  ]}
                >
                  <ActivityIndicator size="small" color={themeColors.primary} />
                  <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                    Actualizando plan semanal...
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* 8. Datos */}
          <View style={[styles.section, { marginBottom: spacing.xl * 2 }]}>
            {renderSectionTitle(t('nutrition.dataAllCaps'), 'data')}
            <View style={[styles.card, dynamicStyles.glassCard]}>
              {/* Borrar datos futuros */}
              <TouchableOpacity style={styles.actionRow} onPress={openCleanFutureModal} activeOpacity={0.7}>
                <Trash2 size={20} color={themeColors.textSecondary} />
                <Text style={[styles.actionText, { color: themeColors.textPrimary }]}>
                  {t('nutrition.deleteFutureData')}
                </Text>
              </TouchableOpacity>

              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />

              {/* Vacaciones */}
              <TouchableOpacity style={styles.actionRow} onPress={openVacationModal} activeOpacity={0.7}>
                <Calendar size={20} color={themeColors.primary} />
                <Text style={[styles.actionText, { color: themeColors.primary }]}>
                  {t('nutrition.manageVacationDays')}
                </Text>
              </TouchableOpacity>

              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />

              {/* Importar menú */}
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => navigation.navigate('Nutrition', { screen: 'MenuImport' })}
                activeOpacity={0.7}
              >
                <FileInput size={20} color={themeColors.primary} />
                <Text style={[styles.actionText, { color: themeColors.primary }]}>
                  {t('nutrition.menuImportSettingsAction')}
                </Text>
              </TouchableOpacity>

              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />

              {/* Exportar */}
              <TouchableOpacity style={styles.actionRow} onPress={openExportModal} activeOpacity={0.7}>
                <Download size={20} color={themeColors.primary} />
                <Text style={[styles.actionText, { color: themeColors.primary }]}>
                  {t('nutrition.exportDietHistory')}
                </Text>
              </TouchableOpacity>

              <View style={[styles.separator, { backgroundColor: themeColors.border }]} />

              {/* Eliminar registros (General) */}
              <TouchableOpacity style={styles.actionRow} onPress={() => setShowDeleteModal(true)} activeOpacity={0.7}>
                <Trash2 size={20} color={themeColors.danger} />
                <Text style={[styles.dangerText, { color: themeColors.danger }]}>{t('nutrition.deleteRecords')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Section Info Modal */}
        <Modal visible={activeSectionInfo !== null} animationType="fade" transparent>
          <View style={styles.modalOverlayBlur}>
            <BlurView intensity={isDark ? 40 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setActiveSectionInfo(null)}
            />
            <LiquidGlassNativeCard style={styles.glassModalCard}>
              <View style={styles.glassModalContent}>
                <View
                  style={[
                    styles.infoIconContainer,
                    { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)' },
                  ]}
                >
                  <Info size={32} color={themeColors.primary} />
                </View>
                {activeSectionInfo && (
                  <>
                    <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                      {t(sectionInfoTextKeys[activeSectionInfo].titleKey)}
                    </Text>
                    <Text style={[styles.infoModalText, { color: themeColors.textSecondary }]}>
                      {t(sectionInfoTextKeys[activeSectionInfo].bodyKey)}
                    </Text>
                  </>
                )}

                <TouchableOpacity
                  onPress={() => setActiveSectionInfo(null)}
                  style={[styles.glassModalButton, { backgroundColor: themeColors.primary }]}
                >
                  <Text style={styles.glassModalButtonText}>{t('common.gotIt')}</Text>
                </TouchableOpacity>
              </View>
            </LiquidGlassNativeCard>
          </View>
        </Modal>

        {/* Export Modal */}
        <Modal visible={showExportModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                dynamicStyles.glassCard,
                Platform.OS === 'web' && styles.webModalContent,
                isDark && { backgroundColor: themeColors.surfaceSolid },
              ]}
            >
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                {t('nutrition.exportHistory')}
              </Text>

              <View style={styles.exportDateRow}>
                <View style={styles.exportDateField}>
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>{t('nutrition.startDate')}</Text>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.webDateInput, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      value={exportStartInput}
                      onChangeText={value => {
                        setExportStartInput(value);
                        const parsed = parseWebDateInput(value);
                        if (!parsed) return;
                        if (parsed > new Date()) return;
                        applyExportStartDate(parsed);
                      }}
                      onBlur={() => {
                        if (!parseWebDateInput(exportStartInput)) {
                          setExportStartInput(format(exportStart, 'yyyy-MM-dd'));
                        }
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={themeColors.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  ) : (
                    <DateTimePicker
                      value={exportStart}
                      mode="date"
                      display="default"
                      themeVariant={isDark ? 'dark' : 'light'}
                      maximumDate={new Date()}
                      onChange={(e, d) => {
                        if (d) {
                          applyExportStartDate(d);
                        }
                      }}
                    />
                  )}
                </View>

                <View style={styles.exportDateField}>
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>{t('nutrition.endDate')}</Text>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.webDateInput, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      value={exportEndInput}
                      onChangeText={value => {
                        setExportEndInput(value);
                        const parsed = parseWebDateInput(value);
                        if (!parsed) return;
                        if (parsed > new Date()) return;
                        applyExportEndDate(parsed);
                      }}
                      onBlur={() => {
                        if (!parseWebDateInput(exportEndInput)) {
                          setExportEndInput(format(exportEnd, 'yyyy-MM-dd'));
                        }
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={themeColors.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  ) : (
                    <DateTimePicker
                      value={exportEnd}
                      mode="date"
                      display="default"
                      themeVariant={isDark ? 'dark' : 'light'}
                      maximumDate={new Date()}
                      onChange={(e, d) => d && applyExportEndDate(d)}
                    />
                  )}
                </View>
              </View>
              {exportRangeErrorMessage ? (
                <Text style={[styles.exportRangeError, { color: themeColors.danger }]}>{exportRangeErrorMessage}</Text>
              ) : null}

              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setShowExportModal(false)} style={styles.modalBtnCancel}>
                  <Text style={styles.modalBtnTextCancel}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleExport}
                  style={[styles.modalBtnConfirm, isExportDisabled && { opacity: 0.45 }]}
                  disabled={isExportDisabled}
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.modalBtnTextConfirm}>{t('nutrition.export')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Vacation Days Modal */}
        <Modal visible={showVacationModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                dynamicStyles.glassCard,
                styles.vacationModalContent,
                isDark && { backgroundColor: themeColors.surfaceSolid },
              ]}
            >
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                {t('nutrition.vacationModalTitle')}
              </Text>
              <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                {t('nutrition.vacationModalSubtitle')}
              </Text>

              <View style={styles.vacationCalendarHeader}>
                <TouchableOpacity
                  style={styles.vacationMonthButton}
                  onPress={() => moveVacationCalendarMonth(-1)}
                  accessibilityRole="button"
                  accessibilityLabel={t('nutrition.previousMonth')}
                >
                  <ChevronLeft size={22} color={themeColors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.vacationMonthTitle, { color: themeColors.textPrimary }]}>
                  {format(vacationCalendarMonth, 'MMMM yyyy', { locale: getDateFnsLocale() })}
                </Text>
                <TouchableOpacity
                  style={styles.vacationMonthButton}
                  onPress={() => moveVacationCalendarMonth(1)}
                  accessibilityRole="button"
                  accessibilityLabel={t('nutrition.nextMonth')}
                >
                  <ChevronRight size={22} color={themeColors.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={styles.vacationWeekHeader}>
                {vacationMonthDays.slice(0, 7).map(day => (
                  <Text
                    key={`weekday-${day.toISOString()}`}
                    style={[styles.vacationWeekday, { color: themeColors.textSecondary }]}
                  >
                    {format(day, 'EEEEE', { locale: getDateFnsLocale() })}
                  </Text>
                ))}
              </View>

              <View style={styles.vacationCalendarGrid}>
                {vacationMonthDays.map(day => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const isSelected = draftVacationDates.has(dateKey);
                  const isCurrentMonth = isSameMonth(day, vacationCalendarMonth);
                  const isCurrentDay = isToday(day);

                  return (
                    <TouchableOpacity
                      key={dateKey}
                      style={[
                        styles.vacationDayCell,
                        { borderColor: themeColors.border },
                        isSelected && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                        isCurrentDay && !isSelected && { borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        if (isCurrentMonth) {
                          toggleVacationDate(dateKey);
                        }
                      }}
                      activeOpacity={isCurrentMonth ? 0.75 : 1}
                      disabled={!isCurrentMonth}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected, disabled: !isCurrentMonth }}
                    >
                      <Text
                        style={[
                          styles.vacationDayText,
                          { color: isCurrentMonth ? themeColors.textPrimary : themeColors.textSecondary },
                          !isCurrentMonth && styles.vacationDayMuted,
                          isSelected && styles.vacationDaySelectedText,
                        ]}
                      >
                        {format(day, 'd')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {isLoadingVacationDates ? (
                <ActivityIndicator size="small" color={themeColors.primary} style={styles.vacationLoader} />
              ) : newDraftVacationDateCount > 0 ? (
                <Text style={[styles.vacationSelectedCount, { color: themeColors.textSecondary }]}>
                  {t('nutrition.vacationSelectedCount', { count: newDraftVacationDateCount })}
                </Text>
              ) : null}

              <View style={styles.vacationModalActions}>
                <TouchableOpacity onPress={clearVacationSelection} style={styles.modalBtnCancel}>
                  <Text style={styles.modalBtnTextCancel}>{t('nutrition.clearSelection')}</Text>
                </TouchableOpacity>
                <View style={styles.vacationModalPrimaryActions}>
                  <TouchableOpacity onPress={() => setShowVacationModal(false)} style={styles.modalBtnCancel}>
                    <Text style={styles.modalBtnTextCancel}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={saveVacationSelection}
                    style={[
                      styles.modalBtnConfirm,
                      (setVacationDates.isPending || isLoadingVacationDates) && { opacity: 0.45 },
                    ]}
                    disabled={setVacationDates.isPending || isLoadingVacationDates}
                  >
                    {setVacationDates.isPending || isLoadingVacationDates ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.modalBtnTextConfirm}>{t('common.save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Time Picker Modal for iOS */}
        {Platform.OS === 'ios' ? (
          <Modal visible={showTimePicker} transparent={true} animationType="slide" onRequestClose={closePicker}>
            <View style={styles.modalOverlayBottom}>
              <TouchableOpacity style={styles.modalBackdrop} onPress={closePicker} />
              <View
                style={[
                  styles.modalContentBottom,
                  { backgroundColor: isDark ? themeColors.surfaceSolid || '#1C1C1E' : '#FFFFFF' },
                ]}
              >
                <View style={styles.iosPickerToolbar}>
                  <TouchableOpacity onPress={closePicker} style={styles.iosPickerDone}>
                    <Text style={[styles.iosPickerDoneText, { color: themeColors.primary }]}>{t('common.done')}</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="time"
                  is24Hour={true}
                  display="spinner"
                  onChange={handleTimeChange}
                  style={styles.iosPicker}
                  textColor={themeColors.textPrimary}
                />
              </View>
            </View>
          </Modal>
        ) : (
          showTimePicker && (
            <DateTimePicker
              value={tempDate}
              mode="time"
              is24Hour={true}
              display="default"
              onChange={handleTimeChange}
            />
          )
        )}

        {/* Nutrition day rollover picker */}
        {Platform.OS === 'ios' ? (
          <Modal
            visible={showNutritionDayPicker}
            transparent={true}
            animationType="slide"
            onRequestClose={closeNutritionDayPicker}
          >
            <View style={styles.modalOverlayBottom}>
              <TouchableOpacity style={styles.modalBackdrop} onPress={closeNutritionDayPicker} />
              <View
                style={[
                  styles.modalContentBottom,
                  { backgroundColor: isDark ? themeColors.surfaceSolid || '#1C1C1E' : '#FFFFFF' },
                ]}
              >
                <View style={styles.iosPickerToolbar}>
                  <TouchableOpacity onPress={closeNutritionDayPicker} style={styles.iosPickerDone}>
                    <Text style={[styles.iosPickerDoneText, { color: themeColors.primary }]}>{t('common.done')}</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={nutritionDayPickerDate}
                  mode="time"
                  is24Hour={true}
                  display="spinner"
                  onChange={handleNutritionDayRolloverChange}
                  style={styles.iosPicker}
                  textColor={themeColors.textPrimary}
                />
              </View>
            </View>
          </Modal>
        ) : (
          showNutritionDayPicker && (
            <DateTimePicker
              value={nutritionDayPickerDate}
              mode="time"
              is24Hour={true}
              display="default"
              onChange={handleNutritionDayRolloverChange}
            />
          )
        )}

        {/* Delete Modal */}
        <Modal visible={showDeleteModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                dynamicStyles.glassCard,
                isDark && { backgroundColor: themeColors.surfaceSolid },
              ]}
            >
              {showDeleteRangeMode ? (
                <>
                  <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                    {t('nutrition.deleteDateRange')}
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                    {t('nutrition.selectDateRangeDelete')}
                  </Text>

                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>{t('nutrition.startDate')}</Text>
                  {Platform.OS === 'web' ? (
                    <TouchableOpacity
                      style={[styles.webDateInput, dynamicStyles.input, { justifyContent: 'center' }]}
                      onPress={() => setActiveDeleteDatePicker('start')}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: themeColors.textPrimary }}>{format(deleteStart, 'dd/MM/yyyy')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <DateTimePicker
                      value={deleteStart}
                      mode="date"
                      display="default"
                      themeVariant={isDark ? 'dark' : 'light'}
                      minimumDate={subDays(new Date(), 365)}
                      maximumDate={new Date()}
                      onChange={(e, d) => {
                        if (d) {
                          setDeleteStart(d);
                          if (d > deleteEnd) {
                            setDeleteEnd(d);
                          }
                        }
                      }}
                    />
                  )}

                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>{t('nutrition.endDate')}</Text>
                  {Platform.OS === 'web' ? (
                    <TouchableOpacity
                      style={[styles.webDateInput, dynamicStyles.input, { justifyContent: 'center' }]}
                      onPress={() => setActiveDeleteDatePicker('end')}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: themeColors.textPrimary }}>{format(deleteEnd, 'dd/MM/yyyy')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <DateTimePicker
                      value={deleteEnd}
                      mode="date"
                      display="default"
                      themeVariant={isDark ? 'dark' : 'light'}
                      minimumDate={deleteStart}
                      maximumDate={new Date()}
                      onChange={(e, d) => d && setDeleteEnd(d)}
                    />
                  )}

                  <View style={styles.modalButtons}>
                    <TouchableOpacity onPress={() => setShowDeleteRangeMode(false)} style={styles.modalBtnCancel}>
                      <Text style={styles.modalBtnTextCancel}>{t('nutrition.backButton')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleDeleteRange}
                      disabled={isDeleting}
                      style={[
                        styles.modalBtnConfirm,
                        { backgroundColor: themeColors.danger },
                        isDeleting && { opacity: 0.6 },
                      ]}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Text style={styles.modalBtnTextConfirm}>{t('common.delete')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : !deleteConfirmAll ? (
                <>
                  <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                    {t('nutrition.deleteRecords')}
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                    {t('nutrition.selectRecordsToDelete')}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.deleteOption,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.background },
                    ]}
                    onPress={() => handleDeleteOption('today')}
                  >
                    <Calendar size={18} color={themeColors.textPrimary} />
                    <Text style={[styles.deleteOptionText, { color: themeColors.textPrimary }]}>
                      {t('nutrition.deleteToday')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.deleteOption,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.background },
                    ]}
                    onPress={() => handleDeleteOption('7days')}
                  >
                    <Calendar size={18} color={themeColors.textPrimary} />
                    <Text style={[styles.deleteOptionText, { color: themeColors.textPrimary }]}>
                      {t('nutrition.deleteLast7Days')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.deleteOption,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.background },
                    ]}
                    onPress={() => handleDeleteOption('range')}
                  >
                    <Calendar size={18} color={themeColors.textPrimary} />
                    <Text style={[styles.deleteOptionText, { color: themeColors.textPrimary }]}>
                      {t('nutrition.deleteDateRange')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.deleteOption, styles.deleteOptionDanger]}
                    onPress={() => handleDeleteOption('all')}
                  >
                    <Trash2 size={18} color={themeColors.danger} />
                    <Text style={[styles.deleteOptionText, { color: themeColors.danger }]}>
                      {t('nutrition.deleteAll')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setShowDeleteModal(false);
                      setShowDeleteRangeMode(false);
                    }}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Trash2
                    size={48}
                    color={themeColors.danger}
                    style={{ alignSelf: 'center', marginBottom: spacing.m }}
                  />
                  <Text style={[styles.modalTitle, { color: themeColors.danger }]}>
                    {t('nutrition.confirmTotalDeletion')}
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                    {t('nutrition.deleteAllNutritionWarning')}
                  </Text>

                  <View style={styles.modalButtons}>
                    <TouchableOpacity onPress={() => setDeleteConfirmAll(false)} style={styles.modalBtnCancel}>
                      <Text style={styles.modalBtnTextCancel}>{t('nutrition.backButton')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={confirmDeleteAll}
                      disabled={isDeleting}
                      style={[
                        styles.modalBtnConfirm,
                        { backgroundColor: themeColors.danger },
                        isDeleting && { opacity: 0.6 },
                      ]}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Text style={styles.modalBtnTextConfirm}>{t('nutrition.deleteAll')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {Platform.OS === 'web' && activeDeleteDatePicker ? (
          <CalendarDatePickerModal
            visible
            value={activeDeleteDatePicker === 'start' ? deleteStart : deleteEnd}
            title={activeDeleteDatePicker === 'start' ? t('nutrition.startDate') : t('nutrition.endDate')}
            minimumDate={activeDeleteDatePicker === 'start' ? subDays(new Date(), 365) : deleteStart}
            maximumDate={new Date()}
            onCancel={() => setActiveDeleteDatePicker(null)}
            onConfirm={date => {
              if (activeDeleteDatePicker === 'start') {
                setDeleteStart(date);
                if (date > deleteEnd) setDeleteEnd(date);
              } else {
                setDeleteEnd(date);
              }
              setActiveDeleteDatePicker(null);
            }}
          />
        ) : null}

        {Platform.OS === 'web' && activeFutureDeleteDatePicker ? (
          <CalendarDatePickerModal
            visible
            value={activeFutureDeleteDatePicker === 'start' ? futureDeleteStart : futureDeleteEnd}
            title={activeFutureDeleteDatePicker === 'start' ? t('nutrition.startDate') : t('nutrition.endDate')}
            minimumDate={activeFutureDeleteDatePicker === 'start' ? futureDeleteBounds.minimumDate : futureDeleteStart}
            maximumDate={futureDeleteBounds.maximumDate}
            onCancel={() => setActiveFutureDeleteDatePicker(null)}
            onConfirm={date => {
              if (activeFutureDeleteDatePicker === 'start') {
                setFutureDeleteStart(date);
                if (date > futureDeleteEnd) setFutureDeleteEnd(date);
              } else {
                setFutureDeleteEnd(date);
              }
              setActiveFutureDeleteDatePicker(null);
            }}
          />
        ) : null}

        {/* Overwrite Warning Modal */}
        <Modal visible={showOverwriteModal} animationType="fade" transparent>
          <View style={styles.modalOverlayBlur}>
            <BlurView intensity={isDark ? 40 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => {
                setShowOverwriteModal(false);
                setPendingMode(null);
              }}
            />
            <LiquidGlassNativeCard style={styles.glassModalCard}>
              <View style={styles.glassModalContent}>
                <AlertTriangle size={48} color={'#F59E0B'} style={{ alignSelf: 'center', marginBottom: spacing.m }} />
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                  {t('nutrition.existingDataDetected')}
                </Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  {t('nutrition.overwriteFutureDataWarning')}
                </Text>

                <Text style={[styles.infoModalText, { color: themeColors.textPrimary }]}>
                  {t('nutrition.overwriteFutureDataQuery')}
                </Text>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowOverwriteModal(false);
                      setPendingMode(null);
                    }}
                    style={styles.modalBtnCancel}
                  >
                    <Text style={styles.modalBtnTextCancel}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (pendingMode) {
                        handleApplyCopyMode(pendingMode, true);
                      }
                      setShowOverwriteModal(false);
                    }}
                    style={[styles.modalBtnConfirm, { backgroundColor: '#F59E0B' }]}
                  >
                    <Text style={[styles.modalBtnTextConfirm, { color: colors.white }]}>
                      {t('nutrition.overwrite')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LiquidGlassNativeCard>
          </View>
        </Modal>

        {/* Deactivate Warning Modal */}
        <Modal visible={showDeactivateModal} animationType="fade" transparent>
          <View style={styles.modalOverlayBlur}>
            <BlurView intensity={isDark ? 40 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setShowDeactivateModal(false)}
            />
            <LiquidGlassNativeCard style={styles.glassModalCard}>
              <View style={styles.glassModalContent}>
                <AlertTriangle size={48} color={'#F59E0B'} style={{ alignSelf: 'center', marginBottom: spacing.m }} />
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                  {t('nutrition.disableAutoPlanConfirm')}
                </Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  {t('nutrition.autoPlanDisableWarning')}
                </Text>

                <Text style={[styles.infoModalText, { color: themeColors.textPrimary }]}>
                  {t('nutrition.futureDietsActionQuery')}
                </Text>

                <View style={{ gap: spacing.s, marginTop: spacing.m }}>
                  <TouchableOpacity
                    onPress={() => handleDeactivate(true)}
                    style={{
                      paddingVertical: spacing.m,
                      paddingHorizontal: spacing.l,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: themeColors.danger,
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.06)',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: themeColors.danger, fontWeight: '600', fontSize: 16 }}>
                      {t('nutrition.deleteFutureDiets')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDeactivate(false)}
                    style={{
                      paddingVertical: spacing.m,
                      paddingHorizontal: spacing.l,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: themeColors.primary,
                      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.06)',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: themeColors.primary, fontWeight: '600', fontSize: 16 }}>
                      {t('nutrition.keepFutureDiets')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowDeactivateModal(false)}
                    style={[styles.cancelButton, { marginTop: 0 }]}
                  >
                    <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LiquidGlassNativeCard>
          </View>
        </Modal>

        {/* Clean Future Modal */}
        <Modal visible={showCleanFutureModal} animationType="fade" transparent>
          <View style={styles.modalOverlayBlur}>
            <BlurView intensity={isDark ? 40 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeCleanFutureModal} />
            <LiquidGlassNativeCard style={styles.glassModalCard}>
              <View style={styles.glassModalContent}>
                {!showCleanFutureRangeMode ? (
                  <>
                    <Trash2
                      size={48}
                      color={themeColors.danger}
                      style={{ alignSelf: 'center', marginBottom: spacing.m }}
                    />
                    <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                      {t('nutrition.deleteFutureData')}
                    </Text>
                    <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                      {t('nutrition.deleteFutureDataWarning')}
                    </Text>

                    <Text style={[styles.infoModalText, { color: themeColors.textPrimary }]}>
                      {t('nutrition.pastDataSafeNote')}
                    </Text>

                    <View style={{ gap: spacing.s, marginTop: spacing.m }}>
                      <TouchableOpacity
                        onPress={handleCleanFuture}
                        style={{
                          paddingVertical: spacing.m,
                          paddingHorizontal: spacing.l,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: themeColors.danger,
                          backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.06)',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: themeColors.danger, fontWeight: '600', fontSize: 16 }}>
                          {t('nutrition.deleteAllFutureMeals')}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setShowCleanFutureRangeMode(true)}
                        style={{
                          paddingVertical: spacing.m,
                          paddingHorizontal: spacing.l,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: themeColors.primary,
                          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.06)',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: themeColors.primary, fontWeight: '600', fontSize: 16 }}>
                          {t('nutrition.deleteFutureRange')}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={closeCleanFutureModal} style={[styles.cancelButton, { marginTop: 0 }]}>
                        <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                      {t('nutrition.deleteFutureRange')}
                    </Text>
                    <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                      {t('nutrition.selectFutureDateRangeDelete')}
                    </Text>

                    <Text style={[styles.label, { color: themeColors.textSecondary }]}>{t('nutrition.startDate')}</Text>
                    {Platform.OS === 'web' ? (
                      <TouchableOpacity
                        style={[styles.webDateInput, dynamicStyles.input, { justifyContent: 'center' }]}
                        onPress={() => setActiveFutureDeleteDatePicker('start')}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: themeColors.textPrimary }}>
                          {format(futureDeleteStart, 'dd/MM/yyyy')}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <DateTimePicker
                        value={futureDeleteStart}
                        mode="date"
                        display="default"
                        themeVariant={isDark ? 'dark' : 'light'}
                        minimumDate={futureDeleteBounds.minimumDate}
                        maximumDate={futureDeleteBounds.maximumDate}
                        onChange={(_event, date) => {
                          if (!date) return;
                          setFutureDeleteStart(date);
                          if (date > futureDeleteEnd) setFutureDeleteEnd(date);
                        }}
                      />
                    )}

                    <Text style={[styles.label, { color: themeColors.textSecondary }]}>{t('nutrition.endDate')}</Text>
                    {Platform.OS === 'web' ? (
                      <TouchableOpacity
                        style={[styles.webDateInput, dynamicStyles.input, { justifyContent: 'center' }]}
                        onPress={() => setActiveFutureDeleteDatePicker('end')}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: themeColors.textPrimary }}>{format(futureDeleteEnd, 'dd/MM/yyyy')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <DateTimePicker
                        value={futureDeleteEnd}
                        mode="date"
                        display="default"
                        themeVariant={isDark ? 'dark' : 'light'}
                        minimumDate={futureDeleteStart}
                        maximumDate={futureDeleteBounds.maximumDate}
                        onChange={(_event, date) => date && setFutureDeleteEnd(date)}
                      />
                    )}

                    <Text style={[styles.infoModalText, { color: themeColors.textPrimary }]}>
                      {t('nutrition.pastDataSafeNote')}
                    </Text>

                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        onPress={() => setShowCleanFutureRangeMode(false)}
                        style={styles.modalBtnCancel}
                      >
                        <Text style={styles.modalBtnTextCancel}>{t('nutrition.backButton')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleCleanFutureRange}
                        disabled={isLoadingCopy}
                        style={[
                          styles.modalBtnConfirm,
                          { backgroundColor: themeColors.danger },
                          isLoadingCopy && { opacity: 0.6 },
                        ]}
                      >
                        {isLoadingCopy ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <Text style={styles.modalBtnTextConfirm}>{t('common.delete')}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </LiquidGlassNativeCard>
          </View>
        </Modal>

        {/* Sequential Mode Info Modal */}
        <Modal visible={showSequentialInfo} animationType="fade" transparent>
          <View style={styles.modalOverlayBlur}>
            <BlurView intensity={isDark ? 40 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setShowSequentialInfo(false)}
            />
            <LiquidGlassNativeCard style={styles.glassModalCard}>
              <View style={styles.glassModalContent}>
                <View
                  style={[
                    styles.infoIconContainer,
                    { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)' },
                  ]}
                >
                  <Info size={32} color={themeColors.primary} />
                </View>
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('nutrition.copyWeekly')}</Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  {t('nutrition.linearPlanExplanation')}
                </Text>

                <View style={styles.infoList}>
                  <Text style={[styles.infoListItem, { color: themeColors.textSecondary }]}>
                    {t('nutrition.linearPlanActivation')}
                  </Text>
                  <Text style={[styles.infoListItem, { color: themeColors.textSecondary }]}>
                    {t('nutrition.linearPlanLogic')}
                  </Text>
                  <Text style={[styles.infoListItem, { color: themeColors.textSecondary }]}>
                    {t('nutrition.linearPlanDesc')}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setShowSequentialInfo(false)}
                  style={[styles.glassModalButton, { backgroundColor: themeColors.primary }]}
                >
                  <Text style={styles.glassModalButtonText}>{t('common.gotIt')}</Text>
                </TouchableOpacity>
              </View>
            </LiquidGlassNativeCard>
          </View>
        </Modal>

        {/* Alternating Mode Info Modal */}
        <Modal visible={showAlternatingInfo} animationType="fade" transparent>
          <View style={styles.modalOverlayBlur}>
            <BlurView intensity={isDark ? 40 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setShowAlternatingInfo(false)}
            />
            <LiquidGlassNativeCard style={styles.glassModalCard}>
              <View style={styles.glassModalContent}>
                <View
                  style={[
                    styles.infoIconContainer,
                    { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)' },
                  ]}
                >
                  <Info size={32} color={themeColors.primary} />
                </View>
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                  {t('nutrition.copyAlternate')}
                </Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  {t('nutrition.cyclicPlanExplanation')}
                </Text>

                <View style={styles.infoList}>
                  <Text style={[styles.infoListItem, { color: themeColors.textSecondary }]}>
                    {t('nutrition.cyclicPlanActivation')}
                  </Text>
                  <Text style={[styles.infoListItem, { color: themeColors.textSecondary }]}>
                    {t('nutrition.visualResultLabel')}
                  </Text>
                  <Text style={[styles.infoListItem, { color: themeColors.textSecondary, marginLeft: 8 }]}>
                    {t('nutrition.cyclicPlanLogic')}
                  </Text>
                  <Text style={[styles.infoListItem, { color: themeColors.textSecondary }]}>
                    {t('nutrition.cyclicPlanDesc')}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setShowAlternatingInfo(false)}
                  style={[styles.glassModalButton, { backgroundColor: themeColors.primary }]}
                >
                  <Text style={styles.glassModalButtonText}>{t('common.gotIt')}</Text>
                </TouchableOpacity>
              </View>
            </LiquidGlassNativeCard>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.m,
    paddingBottom: spacing.xl * 3,
  },
  section: {
    marginBottom: spacing.l,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.m,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.m,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
  },
  toggleLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  toggleDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timeSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    gap: spacing.m,
  },
  timeSettingPill: {
    minWidth: 86,
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: spacing.s,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  timeSettingText: {
    ...typography.caption,
    fontWeight: '700',
  },
  timeSettingInput: {
    ...typography.caption,
    minWidth: 46,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderWidth: 0,
    fontWeight: '700',
    textAlign: 'center',
  },
  hydrationSettingContent: {
    padding: spacing.m,
    gap: spacing.m,
  },
  hydrationSettingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.m,
  },
  hydrationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  hydrationInputShell: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hydrationInput: {
    flex: 1,
    ...typography.body,
    fontWeight: '700',
    paddingVertical: 0,
  },
  hydrationInputUnit: {
    ...typography.caption,
    fontWeight: '700',
  },
  hydrationSaveButton: {
    minWidth: 92,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
  },
  hydrationSaveButtonText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '700',
  },
  hydrationPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  hydrationPresetChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
  },
  hydrationPresetText: {
    ...typography.caption,
    fontWeight: '700',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.m,
  },
  radioDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    marginRight: spacing.m,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  radioLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    gap: spacing.m,
  },
  actionText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '500',
  },
  actionCopy: {
    flex: 1,
    gap: 2,
  },
  actionDescription: {
    ...typography.caption,
    lineHeight: 18,
  },
  dangerCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderWidth: 1,
    borderColor: colors.danger + '30',
  },
  dangerText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.l,
  },
  modalOverlayBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.l,
    padding: spacing.l,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  webModalContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  vacationModalContent: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  glassModalCard: {
    borderRadius: 24,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  glassModalCardDark: {
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  glassModalContent: {
    padding: spacing.l,
  },
  infoIconContainer: {
    alignSelf: 'center',
    marginBottom: spacing.m,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassModalButton: {
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.xl,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: spacing.l,
  },
  glassModalButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  modalTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.s,
    fontWeight: '700',
  },
  modalSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.l,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: spacing.m,
    marginBottom: spacing.xs,
  },
  exportDateRow: {
    flexDirection: 'row',
    gap: spacing.m,
    marginBottom: spacing.s,
  },
  exportDateField: {
    flex: 1,
  },
  webDateInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.s,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    fontSize: 16,
  },
  exportRangeError: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
    gap: spacing.m,
  },
  modalBtnCancel: {
    padding: spacing.s,
    paddingHorizontal: spacing.m,
  },
  modalBtnTextCancel: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modalBtnConfirm: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.l,
    borderRadius: borderRadius.s,
  },
  modalBtnTextConfirm: {
    color: colors.white,
    fontWeight: '600',
  },
  vacationCalendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.s,
    marginBottom: spacing.m,
  },
  vacationMonthButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vacationMonthTitle: {
    ...typography.body,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  vacationWeekHeader: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  vacationWeekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    ...typography.caption,
    fontWeight: '700',
  },
  vacationCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
  },
  vacationDayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.s,
  },
  vacationDayText: {
    fontSize: 15,
    fontWeight: '700',
  },
  vacationDayMuted: {
    opacity: 0.38,
  },
  vacationDaySelectedText: {
    color: colors.white,
  },
  vacationLoader: {
    marginTop: spacing.m,
  },
  vacationSelectedCount: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.m,
    fontWeight: '600',
  },
  vacationModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.l,
    gap: spacing.m,
  },
  vacationModalPrimaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  deleteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    backgroundColor: colors.background,
    borderRadius: borderRadius.s,
    marginBottom: spacing.s,
    gap: spacing.m,
  },
  deleteOptionDanger: {
    backgroundColor: colors.danger + '10',
    borderWidth: 1,
    borderColor: colors.danger + '30',
  },
  deleteOptionText: {
    ...typography.body,
    fontWeight: '500',
  },
  cancelButton: {
    marginTop: spacing.m,
    padding: spacing.m,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  // Import modal styles
  importModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  downloadTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.s,
    backgroundColor: colors.primary + '15',
  },
  downloadTemplateText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  importNote: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.l,
    paddingHorizontal: spacing.m,
  },
  importMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.m,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    marginBottom: spacing.s,
  },
  importMainBtnText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  // Info modal styles
  infoModalText: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.m,
    lineHeight: 22,
  },
  infoModalSubtitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: spacing.s,
    marginBottom: spacing.xs,
  },
  // Copy mode row styles
  copyModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    gap: spacing.m,
  },
  copyModeLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  shoppingDayGrid: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  shoppingListSettingContent: {
    padding: spacing.m,
    gap: spacing.m,
  },
  shoppingDayButton: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shoppingDayButtonText: {
    ...typography.caption,
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 13,
  },
  infoButton: {
    padding: spacing.xs,
  },
  loadingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.m,
    gap: spacing.s,
    backgroundColor: colors.background + 'F0',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  // Standard Info List Styles
  infoList: {
    marginBottom: spacing.l,
    paddingHorizontal: spacing.s,
  },
  infoListItem: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
  },
  iosPickerToolbar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  iosPickerDone: {
    padding: 4,
  },
  iosPickerDoneText: {
    ...typography.h4,
    fontWeight: '600',
  },
  iosPicker: {
    width: '100%',
    height: 200,
  },
  modalOverlayBottom: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContentBottom: {
    width: '100%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.l + 20, // Add bottom padding for safety
  },
});

export default NutritionSettingsScreen;
