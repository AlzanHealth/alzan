import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../../lib/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { addDays, format, parseISO } from 'date-fns';
import { convertEnergyToUi } from '../../../utils/unitConversionUtils';
import { DietTemplateMeal, EnergyUnit, MealItem, MealLog, NutritionDayStatus } from '../../../types/requests.types';
import i18n from '../../../i18n';
import { TranslationKey } from '../../../i18n/locales/en';
import { getDateFnsLocale } from '../../../i18n/dateLocale';
import { createVacationDateSet, getNutritionExportAverageDayCount } from './nutritionVacation';

import iconSource from '../../../../assets/icon.png';

type MealLogWithItems = MealLog & { items: MealItem[] };
type PlannedMealWithLog = {
  plan: DietTemplateMeal;
  log: MealLogWithItems | null;
};

const t = (key: TranslationKey) => String(i18n.t(key));
const isEnglish = () => i18n.language?.startsWith('en');
const getPdfDatePattern = () => (isEnglish() ? 'MMMM d, yyyy' : 'd MMMM yyyy');
const getPdfDayDatePattern = () => (isEnglish() ? 'EEEE, MMMM d' : 'EEEE, d MMMM');
const ACTIVE_TEMPLATE_STORAGE_KEY = 'active_diet_template_id';

const buildDateRange = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  let cursor = parseISO(startDate);
  const end = parseISO(endDate);

  while (cursor <= end) {
    dates.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, 1);
  }

  return dates;
};

// Load asset helper
const loadAssetAsBase64 = async (module: number): Promise<string | null> => {
  try {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();
    if (!asset.localUri) return null;
    return await FileSystem.readAsStringAsync(asset.localUri, { encoding: 'base64' });
  } catch (e) {
    console.warn('Error loading asset:', e);
    return null;
  }
};

interface DaySummary {
  date: string;
  isVacation: boolean;
  logs: MealLogWithItems[];
  plannedMeals: PlannedMealWithLog[];
  totals: {
    kcal: number;
    protein: number;
    carbs: number;
    fats: number;
  };
}
interface PDFExportOptions {
  startDate: string;
  endDate: string;
  user: {
    id: string;
    display_name?: string | null;
    email?: string;
  };
  webPrintWindow?: WebExportWindow | null;
  returnHtml?: boolean;
}

interface WebExportWindow {
  document: {
    open: () => void;
    write: (content: string) => void;
    close: () => void;
  };
  focus?: () => void;
  print?: () => void;
  close?: () => void;
}

export type { WebExportWindow };

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

const openWebExportWindow = (): WebExportWindow | null => {
  if (Platform.OS !== 'web') return null;

  const maybeGlobal = globalThis as {
    open?: (url?: string, target?: string) => WebExportWindow | null;
  };
  if (typeof maybeGlobal.open !== 'function') return null;
  return maybeGlobal.open('', '_blank');
};

const getActiveTemplateId = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(ACTIVE_TEMPLATE_STORAGE_KEY);
  } catch {
    return null;
  }
};

const getMappedDayOfWeek = (date: string): number => {
  const day = parseISO(date).getDay();
  return day === 0 ? 7 : day;
};

const getAdherenceLabel = (status: string | null | undefined): string => {
  switch (status) {
    case 'done_as_planned':
      return t('nutrition.pdfDoneAsPlanned');
    case 'done_with_changes':
      return t('nutrition.pdfDoneWithChanges');
    case 'skipped':
      return t('nutrition.pdfSkippedMeal');
    case 'extra_meal':
      return t('nutrition.pdfExtraMeal');
    default:
      return t('nutrition.pdfLoggedMeal');
  }
};

export const generateDietPDF = async ({ startDate, endDate, user, webPrintWindow, returnHtml }: PDFExportOptions) => {
  try {
    const userId = user.id;
    if (!userId) throw new Error('User ID not provided');

    const { data: prefsData } = await supabase
      .from('user_preferences')
      .select('energy_unit')
      .eq('user_id', userId)
      .single();

    const energyUnit: EnergyUnit = prefsData?.energy_unit === 'kj' ? 'kj' : 'kcal';
    const activeTemplateId = await getActiveTemplateId();

    const { data: nutritionGoal } = await supabase
      .from('user_goals')
      .select('target_calories_kcal, target_protein_g, target_carbs_g, target_fats_g, description')
      .eq('user_id', userId)
      .eq('goal_type', 'nutrition')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    let finalDisplayName = user.display_name;
    if (!finalDisplayName) {
      const { data: profile } = await supabase.from('users').select('display_name').eq('id', userId).single();
      if (profile) finalDisplayName = profile.display_name;
    }
    finalDisplayName = finalDisplayName || t('nutrition.pdfUnknownUser');

    const iconBase64 = await loadAssetAsBase64(iconSource);
    const iconSrc = iconBase64 ? `data:image/png;base64,${iconBase64}` : null;

    const { data: logs, error: logsError } = await supabase
      .from('meal_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (logsError) throw new Error(getErrorMessage(logsError));
    const safeLogs = logs ?? [];

    const { data: dayStatuses, error: dayStatusesError } = await supabase
      .from('nutrition_day_statuses')
      .select('user_id, date, status, note, created_at, updated_at')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .returns<NutritionDayStatus[]>();

    if (dayStatusesError) throw new Error(getErrorMessage(dayStatusesError));
    const vacationDates = createVacationDateSet(dayStatuses);

    const logIds = safeLogs.map(l => l.id);
    const { data: items, error: itemsError } =
      logIds.length > 0
        ? await supabase.from('meal_items').select('*').in('meal_log_id', logIds)
        : { data: [], error: null };

    if (itemsError) throw new Error(getErrorMessage(itemsError));
    const safeItems = items ?? [];

    const { data: templateMeals, error: templateMealsError } = activeTemplateId
      ? await supabase
          .from('diet_template_meals')
          .select('*')
          .eq('diet_template_id', activeTemplateId)
          .order('day_of_week', { ascending: true })
          .order('order_index', { ascending: true })
          .returns<DietTemplateMeal[]>()
      : { data: [], error: null };

    if (templateMealsError) throw new Error(getErrorMessage(templateMealsError));
    const safeTemplateMeals = templateMeals ?? [];

    const itemsByLogId = new Map<string, MealItem[]>();
    safeItems.forEach(item => {
      const bucket = itemsByLogId.get(item.meal_log_id) ?? [];
      bucket.push(item);
      itemsByLogId.set(item.meal_log_id, bucket);
    });

    const daysMap = new Map<string, DaySummary>();

    buildDateRange(startDate, endDate).forEach(date => {
      daysMap.set(date, {
        date,
        isVacation: vacationDates.has(date),
        logs: [],
        plannedMeals: [],
        totals: { kcal: 0, protein: 0, carbs: 0, fats: 0 },
      });
    });

    safeLogs.forEach(log => {
      const date = log.date;
      if (!daysMap.has(date)) {
        daysMap.set(date, {
          date,
          isVacation: vacationDates.has(date),
          logs: [],
          plannedMeals: [],
          totals: { kcal: 0, protein: 0, carbs: 0, fats: 0 },
        });
      }

      const day = daysMap.get(date);
      if (!day) return;
      const logItems = itemsByLogId.get(log.id) ?? [];

      const meal = {
        ...log,
        items: logItems,
      };

      day.logs.push(meal);
      if (log.adherence_status !== 'skipped') {
        day.totals.kcal += log.kcal || 0;
        day.totals.protein += log.protein_g || 0;
        day.totals.carbs += log.carbs_g || 0;
        day.totals.fats += log.fats_g || 0;
      }
    });

    daysMap.forEach(day => {
      if (day.isVacation) return;
      const plannedForDay = safeTemplateMeals.filter(plan => plan.day_of_week === getMappedDayOfWeek(day.date));
      day.plannedMeals = plannedForDay.map(plan => {
        const log =
          day.logs.find(item => item.diet_template_meal_id === plan.id && item.adherence_status !== 'extra_meal') ??
          null;
        return { plan, log };
      });
    });

    const totalDays = daysMap.size;
    const averageDays = getNutritionExportAverageDayCount(
      Array.from(daysMap.values()).map(day => ({
        isVacation: day.isVacation,
        loggedMealCount: day.logs.length,
      })),
    );
    const grandTotal = { kcal: 0, protein: 0, carbs: 0, fats: 0 };
    daysMap.forEach(day => {
      grandTotal.kcal += day.totals.kcal;
      grandTotal.protein += day.totals.protein;
      grandTotal.carbs += day.totals.carbs;
      grandTotal.fats += day.totals.fats;
    });

    const averages = {
      kcal: Math.round(grandTotal.kcal / averageDays) || 0,
      protein: Math.round(grandTotal.protein / averageDays) || 0,
      carbs: Math.round(grandTotal.carbs / averageDays) || 0,
      fats: Math.round(grandTotal.fats / averageDays) || 0,
    };
    const dateLocale = getDateFnsLocale();
    const datePattern = getPdfDatePattern();
    const dayDatePattern = getPdfDayDatePattern();

    const formatGoalDelta = (actual: number, target: number | null | undefined): string => {
      if (target == null || target <= 0) return '';
      const delta = Math.round(actual - target);
      if (delta === 0) return '0';
      return delta > 0 ? `+${delta}` : `${delta}`;
    };

    const renderGoalComparison = (): string => {
      const targetKcal = nutritionGoal?.target_calories_kcal ?? null;
      const targetProtein = nutritionGoal?.target_protein_g ?? null;
      const targetCarbs = nutritionGoal?.target_carbs_g ?? null;
      const targetFats = nutritionGoal?.target_fats_g ?? null;

      const hasTargets = [targetKcal, targetProtein, targetCarbs, targetFats].some(value => value != null && value > 0);
      if (!hasTargets) return '';

      const rows = [
        {
          label: energyUnit === 'kj' ? 'kJ' : 'kcal',
          current: convertEnergyToUi(averages.kcal, energyUnit).value,
          target: targetKcal != null ? convertEnergyToUi(targetKcal, energyUnit).value : null,
          delta: targetKcal != null ? convertEnergyToUi(averages.kcal - targetKcal, energyUnit).value : null,
          unit: convertEnergyToUi(averages.kcal, energyUnit).unit,
        },
        {
          label: t('nutrition.proteins'),
          current: averages.protein,
          target: targetProtein,
          delta: targetProtein != null ? Number(formatGoalDelta(averages.protein, targetProtein)) : null,
          unit: 'g',
        },
        {
          label: t('nutrition.carbs'),
          current: averages.carbs,
          target: targetCarbs,
          delta: targetCarbs != null ? Number(formatGoalDelta(averages.carbs, targetCarbs)) : null,
          unit: 'g',
        },
        {
          label: t('nutrition.fats'),
          current: averages.fats,
          target: targetFats,
          delta: targetFats != null ? Number(formatGoalDelta(averages.fats, targetFats)) : null,
          unit: 'g',
        },
      ];

      return `
        <div class="section-subtitle">${escapeHtml(t('nutrition.pdfGoalComparison'))}</div>
        <table class="target-table">
          <thead>
            <tr>
              <th>${escapeHtml(t('nutrition.pdfMetric'))}</th>
              <th class="col-num">${escapeHtml(t('nutrition.pdfDailyAverage'))}</th>
              <th class="col-num">${escapeHtml(t('nutrition.pdfGoal'))}</th>
              <th class="col-num">${escapeHtml(t('nutrition.pdfDelta'))}</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(row => {
                const targetLabel = row.target == null ? '-' : `${Math.round(row.target)}${row.unit}`;
                const deltaLabel =
                  row.delta == null ? '-' : `${row.delta > 0 ? '+' : ''}${Math.round(row.delta)}${row.unit}`;
                return `
                  <tr>
                    <td>${escapeHtml(row.label)}</td>
                    <td class="col-num">${Math.round(row.current)}${escapeHtml(row.unit)}</td>
                    <td class="col-num">${escapeHtml(targetLabel)}</td>
                    <td class="col-num">${escapeHtml(deltaLabel)}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      `;
    };

    const renderMacroLine = (label: string, values: { kcal: number; protein: number; carbs: number; fats: number }) => `
      <div class="macro-line">
        <strong>${escapeHtml(label)}:</strong>
        ${escapeHtml(
          `${convertEnergyToUi(values.kcal, energyUnit).label} · ${t('nutrition.proteins')}: ${Math.round(values.protein)}g · ${t('nutrition.carbs')}: ${Math.round(values.carbs)}g · ${t('nutrition.fats')}: ${Math.round(values.fats)}g`,
        )}
      </div>
    `;

    const renderMealItemsTable = (meal: MealLogWithItems): string => {
      if (!meal.items || meal.items.length === 0) {
        return `
          <div style="font-size: 12px; color: #999; padding-left: 8px;">
            ${escapeHtml(t('nutrition.pdfQuickLogNoIngredients'))}
          </div>
        `;
      }

      return `
        <table>
          <thead>
            <tr>
              <th class="col-main">${escapeHtml(t('nutrition.pdfIngredient'))}</th>
              <th class="col-num">${escapeHtml(t('nutrition.pdfQuantityAbbr'))}</th>
              <th class="col-num">${energyUnit === 'kj' ? 'kJ' : 'kcal'}</th>
              <th class="col-num">${escapeHtml(t('nutrition.pdfProteinShort'))}</th>
              <th class="col-num">${escapeHtml(t('nutrition.pdfCarbsShort'))}</th>
              <th class="col-num">${escapeHtml(t('nutrition.pdfFatShort'))}</th>
            </tr>
          </thead>
          <tbody>
            ${meal.items
              .map(
                item => `
                <tr>
                  <td>${escapeHtml(normalizeText(item.name) || '-')}</td>
                  <td class="col-num">${item.quantity_g}g</td>
                  <td class="col-num">${convertEnergyToUi(item.kcal, energyUnit).value}</td>
                  <td class="col-num">${Math.round(item.protein_g ?? 0)}</td>
                  <td class="col-num">${Math.round(item.carbs_g ?? 0)}</td>
                  <td class="col-num">${Math.round(item.fats_g ?? 0)}</td>
                </tr>
              `,
              )
              .join('')}
          </tbody>
        </table>
      `;
    };

    const renderLoggedMeal = (meal: MealLogWithItems, plannedMeal?: DietTemplateMeal): string => {
      const isSkipped = meal.adherence_status === 'skipped';
      const plannedName = normalizeText(plannedMeal?.base_name);
      const displayName = normalizeText(meal.name) ?? plannedName;
      const actualValues = {
        kcal: isSkipped ? 0 : meal.kcal || 0,
        protein: isSkipped ? 0 : meal.protein_g || 0,
        carbs: isSkipped ? 0 : meal.carbs_g || 0,
        fats: isSkipped ? 0 : meal.fats_g || 0,
      };

      return `
        <div class="meal-block avoid-break">
          <div class="meal-header">
            <div class="meal-name">
              ${escapeHtml(translateMealType(meal.meal_type))}
              ${displayName ? `— <span style="font-weight:400">${escapeHtml(displayName)}</span>` : ''}
              <span class="meal-status">${escapeHtml(getAdherenceLabel(meal.adherence_status))}</span>
            </div>
            <div class="meal-total">${escapeHtml(convertEnergyToUi(actualValues.kcal, energyUnit).label)}</div>
          </div>
          ${
            plannedMeal
              ? renderMacroLine(t('nutrition.pdfPlannedTarget'), {
                  kcal: plannedMeal.target_kcal || 0,
                  protein: plannedMeal.target_protein_g || 0,
                  carbs: plannedMeal.target_carbs_g || 0,
                  fats: plannedMeal.target_fats_g || 0,
                })
              : ''
          }
          ${renderMacroLine(t('nutrition.pdfActualIntake'), actualValues)}
          ${isSkipped ? '' : renderMealItemsTable(meal)}
        </div>
      `;
    };

    const renderPendingPlannedMeal = (plan: DietTemplateMeal): string => `
      <div class="meal-block meal-block-pending avoid-break">
        <div class="meal-header">
          <div class="meal-name">
            ${escapeHtml(translateMealType(plan.meal_type))}
            — <span style="font-weight:400">${escapeHtml(plan.base_name)}</span>
            <span class="meal-status">${escapeHtml(t('nutrition.pdfPendingMeal'))}</span>
          </div>
          <div class="meal-total">${escapeHtml(convertEnergyToUi(plan.target_kcal || 0, energyUnit).label)}</div>
        </div>
        ${renderMacroLine(t('nutrition.pdfPlannedTarget'), {
          kcal: plan.target_kcal || 0,
          protein: plan.target_protein_g || 0,
          carbs: plan.target_carbs_g || 0,
          fats: plan.target_fats_g || 0,
        })}
      </div>
    `;

    const renderDayMeals = (day: DaySummary): string => {
      const vacationHtml = day.isVacation
        ? `
          <div class="meal-block meal-block-vacation avoid-break">
            <div class="meal-header">
              <div class="meal-name">
                ${escapeHtml(t('nutrition.pdfVacationDay'))}
                <span class="meal-status">${escapeHtml(t('nutrition.pdfVacationDay'))}</span>
              </div>
              <div class="meal-total">-</div>
            </div>
            <div class="macro-line">${escapeHtml(t('nutrition.pdfVacationDayDescription'))}</div>
          </div>
        `
        : '';
      const plannedHtml = day.plannedMeals
        .map(({ plan, log }) => (log ? renderLoggedMeal(log, plan) : renderPendingPlannedMeal(plan)))
        .join('');
      const plannedLogIds = new Set(day.plannedMeals.map(({ log }) => log?.id).filter((id): id is string => !!id));
      const extraLogs = day.logs.filter(log => !plannedLogIds.has(log.id));
      const extraHtml = extraLogs.map(log => renderLoggedMeal(log)).join('');

      if (vacationHtml || plannedHtml || extraHtml) return `${vacationHtml}${plannedHtml}${extraHtml}`;

      return `
        <div class="meal-block avoid-break">
          <div style="font-size: 12px; color: #999; padding-left: 8px;">
            ${escapeHtml(t('nutrition.pdfNoMealsLoggedForDay'))}
          </div>
        </div>
      `;
    };

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    color: #333;
                    margin: 0;
                    padding: 40px;
                    -webkit-print-color-adjust: exact;
                }
                @page {
                    margin: 20px;
                }
                .page-break { page-break-before: always; }
                .avoid-break { page-break-inside: avoid; }
                
                /* Colors */
                :root {
                    --primary: #007AFF;
                    --text: #333;
                    --text-secondary: #666;
                    --border: #E5E5EA;
                    --bg-header: #F5F5F7;
                }

                .cover {
                    min-height: 500px;
                    padding: 80px 40px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    text-align: center;
                    page-break-after: always;
                }
                .logo {
                    font-size: 40px;
                    font-weight: 800;
                    color: var(--primary);
                    margin-bottom: 20px;
                    letter-spacing: -1px;
                }
                .logo svg {
                    width: 80px;
                    height: 80px;
                    margin-bottom: 15px;
                }
                .cover-title {
                    font-size: 32px;
                    font-weight: 300;
                    margin-bottom: 40px;
                    color: var(--text);
                }
                .cover-details {
                    font-size: 16px;
                    color: var(--text-secondary);
                    line-height: 1.6;
                }
                .cover-user {
                    font-size: 24px;
                    font-weight: 600;
                    color: var(--text);
                    margin-bottom: 10px;
                }
                
                /* Summary */
                .section-title {
                    font-size: 18px;
                    font-weight: 700;
                    color: var(--primary);
                    border-bottom: 2px solid var(--primary);
                    padding-bottom: 8px;
                    margin-bottom: 20px;
                    margin-top: 40px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .summary-card {
                    background: var(--bg-header);
                    padding: 20px;
                    border-radius: 12px;
                    text-align: center;
                }
                .summary-val {
                    font-size: 24px;
                    font-weight: 800;
                    color: var(--primary);
                    margin-bottom: 4px;
                }
                .summary-label {
                    font-size: 12px;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                }
                .disclaimer {
                    font-size: 12px;
                    color: #999;
                    font-style: italic;
                    margin-top: 20px;
                }

                /* Day Block */
                .day-header {
                    background: var(--primary);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 30px;
                    margin-bottom: 15px;
                }
                .day-date {
                    font-weight: 600;
                    font-size: 16px;
                }
                .day-total {
                    font-weight: 700;
                    font-size: 16px;
                }

                /* Meal Block */
                .meal-block {
                    margin-bottom: 25px;
                    border-left: 3px solid var(--border);
                    padding-left: 15px;
                }
                .meal-block-pending {
                    opacity: 0.72;
                }
                .meal-block-vacation {
                    border-left-color: var(--primary);
                    background: #F4F8FF;
                    padding-top: 12px;
                    padding-bottom: 12px;
                    border-radius: 0 8px 8px 0;
                }
                .meal-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 10px;
                }
                .meal-name {
                    font-weight: 700;
                    font-size: 14px;
                    color: var(--text);
                }
                .meal-total {
                    font-weight: 600;
                    font-size: 14px;
                    color: var(--text-secondary);
                }
                .meal-status {
                    display: inline-block;
                    margin-left: 8px;
                    padding: 2px 7px;
                    border-radius: 999px;
                    background: #EEF4FF;
                    color: var(--primary);
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                .macro-line {
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin: 6px 0 10px;
                    line-height: 1.5;
                }
                .section-subtitle {
                    font-size: 13px;
                    font-weight: 700;
                    color: var(--text);
                    margin: 20px 0 8px;
                    text-transform: uppercase;
                    letter-spacing: 0.6px;
                }
                .target-table {
                    margin-bottom: 20px;
                }

                /* Table */
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }
                th {
                    text-align: left;
                    color: var(--text-secondary);
                    font-weight: 600;
                    padding: 4px 8px;
                    border-bottom: 1px solid var(--border);
                }
                td {
                    padding: 6px 8px;
                    border-bottom: 1px solid var(--border);
                    color: var(--text);
                }
                tr:last-child td {
                    border-bottom: none;
                }
                .col-num {
                    text-align: right;
                    width: 50px;
                }
                .col-main {
                    
                }

                /* Footer */
                .footer {
                    position: fixed;
                    bottom: 20px;
                    left: 40px;
                    right: 40px;
                    text-align: center;
                    font-size: 10px;
                    color: #CCC;
                }

            </style>
        </head>
        <body>

            <!-- Page 1: Cover -->
            <div class="cover">
                <div class="logo">
                     ${
                       iconSrc
                         ? `<img src="${iconSrc}" style="width: 80px; height: 80px; margin: 0 auto; display: block; border-radius: 16px; margin-bottom: 15px;" />`
                         : `<svg viewBox="0 0 24 24" style="width: 60px; height: 60px; margin: 0 auto; fill: #007AFF; display: block;">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>`
                     }
                    ${escapeHtml(t('nutrition.pdfTitle'))}
                </div>
                <div class="cover-title">${escapeHtml(t('nutrition.pdfSubtitle'))}</div>
                <div class="cover-user">${escapeHtml(finalDisplayName)}</div>
                <div class="cover-details">
                    <p>${escapeHtml(format(parseISO(startDate), datePattern, { locale: dateLocale }))} / ${escapeHtml(format(parseISO(endDate), datePattern, { locale: dateLocale }))}</p>
                    <p style="font-size: 12px; margin-top: 30px;">${escapeHtml(t('nutrition.pdfGeneratedAt'))}: ${escapeHtml(format(new Date(), datePattern, { locale: dateLocale }))}</p>
                </div>
            </div>

            <!-- Page 2: Summary -->
            <div class="summary-page">
            <div class="section-title">${escapeHtml(t('nutrition.pdfGeneralSummary'))}</div>
            <p style="margin-bottom: 20px;">
                ${escapeHtml(t('nutrition.pdfPeriodSummary'))} (${totalDays} ${escapeHtml(t('health.days'))})
            </p>
            
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="summary-val">${convertEnergyToUi(averages.kcal, energyUnit).value}</div>
                    <div class="summary-label">${escapeHtml(convertEnergyToUi(averages.kcal, energyUnit).unit)} / ${escapeHtml(t('nutrition.pdfPerDay'))}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-val">${averages.protein}g</div>
                    <div class="summary-label">${escapeHtml(t('nutrition.proteins'))}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-val">${averages.carbs}g</div>
                    <div class="summary-label">${escapeHtml(t('nutrition.carbs'))}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-val">${averages.fats}g</div>
                    <div class="summary-label">${escapeHtml(t('nutrition.fats'))}</div>
                </div>
            </div>
            
            <div class="disclaimer">
                ${escapeHtml(t('nutrition.pdfEstimateNote'))}
            </div>
            ${renderGoalComparison()}

            </div> <!-- end summary-page -->

            <div class="page-break"></div>

            <!-- Page 3+: Daily Logs -->
            <div class="section-title">${escapeHtml(t('nutrition.pdfMealsDiary'))}</div>

            ${Array.from(daysMap.values())
              .map(
                day => `
                <div class="day-block avoid-break">
                    <div class="day-header">
                        <span class="day-date">${escapeHtml(format(parseISO(day.date), dayDatePattern, { locale: dateLocale }))}</span>
                        <span class="day-total">${escapeHtml(convertEnergyToUi(day.totals.kcal, energyUnit).label)}</span>
                    </div>
                    <div class="macro-line">
                        ${escapeHtml(`${t('nutrition.proteins')}: ${Math.round(day.totals.protein)}g · ${t('nutrition.carbs')}: ${Math.round(day.totals.carbs)}g · ${t('nutrition.fats')}: ${Math.round(day.totals.fats)}g`)}
                    </div>
                    
                    ${renderDayMeals(day)}
                </div>
            `,
              )
              .join('')}


            <!-- Footer -->
            <div class="footer">
                ${escapeHtml(t('nutrition.pdfAutoGeneratedDocument'))}
            </div>
        </body>
        </html>
        `;

    if (returnHtml) return html;

    if (Platform.OS === 'web') {
      const targetWindow = webPrintWindow ?? openWebExportWindow();
      if (!targetWindow) {
        throw new Error(t('nutrition.pdfWebOpenBlocked'));
      }

      const printableHtml = `
        ${html}
        <script>
          window.addEventListener('load', function () {
            setTimeout(function () {
              window.focus();
              window.print();
            }, 120);
          });
        </script>
      `;

      targetWindow.document.open();
      targetWindow.document.write(printableHtml);
      targetWindow.document.close();
      return;
    }

    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    const rawFileName = `${t('nutrition.pdfFilePrefix')}-${startDate}_${endDate}.pdf`;
    const fileName = rawFileName.replace(/[\\/:*?"<>|]/g, '-');
    const baseDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!baseDirectory) {
      throw new Error(t('nutrition.pdfGenerateRetry'));
    }
    const newUri = `${baseDirectory}${fileName}`;

    await FileSystem.moveAsync({
      from: uri,
      to: newUri,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(newUri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: t('nutrition.pdfShareDialogTitle'),
      });
      return;
    }

    await Print.printAsync({ html });
  } catch (error: unknown) {
    if (!(error instanceof Error) || !error.message.includes(t('nutrition.pdfNoRecordsInRange'))) {
      console.error('Error generating diet PDF:', error);
    }
    throw new Error(getErrorMessage(error));
  }
};

// Helper
const translateMealType = (type: string) => {
  const map: Record<string, string> = {
    breakfast: t('settings.breakfast'),
    almuerzo: t('settings.almuerzo'),
    lunch: t('settings.lunch'),
    dinner: t('settings.dinner'),
    snack: t('settings.snack'),
    merienda: t('settings.merienda'),
  };
  return map[type] || type;
};
