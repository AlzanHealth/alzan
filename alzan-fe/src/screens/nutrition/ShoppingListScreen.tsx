import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SectionList,
  Share as NativeShare,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ChevronRight, Copy, ListPlus, RotateCcw, Share2, ShoppingBasket } from 'lucide-react-native';
import { addDays, format, parseISO, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';

import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import { useAuth } from '../../context/AuthContext';
import { useShoppingList } from '../../modules/nutrition/hooks/useShoppingList';
import { useShoppingListCompletion } from '../../modules/nutrition/hooks/useShoppingListCompletion';
import { ShoppingListIngredientRow } from '../../modules/nutrition/components/ShoppingListIngredientRow';
import {
  formatShoppingQuantity,
  formatShoppingListForExport,
  groupShoppingIngredientsByCategory,
  type ShoppingListCategoryGroup,
  type ShoppingListIngredient,
} from '../../modules/nutrition/services/shoppingListPlanner';
import { CATEGORY_LABELS } from '../../modules/nutrition/components/IngredientCategoryFilter';
import { createAppleReminders } from '../../modules/nutrition/services/appleRemindersNative';
import { formatLocalizedDate } from '../../i18n/dateLocale';
import { useTabBarLayout } from '../../navigation/tabBarLayout';
import type { NutritionScreenNavigationProp, NutritionStackParamList } from '../../types/navigation.types';

const formatPeriodDate = (date: string) =>
  formatLocalizedDate(parseISO(date), {
    en: 'EEE d MMM',
    es: 'EEE d MMM',
  });

const copyTextToClipboard = async (text: string): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') throw new Error('Clipboard is unavailable');

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!copied) throw new Error('Clipboard copy failed');
};

export const ShoppingListScreen = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigation = useNavigation<NutritionScreenNavigationProp>();
  const route = useRoute<RouteProp<NutritionStackParamList, 'ShoppingList'>>();
  const { styles: dynamicStyles, colors } = useNutritionStyles();
  const { topFromScreenBottom } = useTabBarLayout();
  const initialDate = route.params?.date || format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const { error, isLoading, isFetching, refetch, range, ingredients } = useShoppingList(selectedDate);
  const { completedKeys, isHydrated, toggleIngredient, clearCompleted } = useShoppingListCompletion(
    user?.id,
    range.startDate,
  );
  const completedCount = useMemo(
    () => ingredients.reduce((count, ingredient) => count + (completedKeys.has(ingredient.key) ? 1 : 0), 0),
    [completedKeys, ingredients],
  );
  const pendingIngredients = useMemo(
    () => ingredients.filter(ingredient => !completedKeys.has(ingredient.key)),
    [completedKeys, ingredients],
  );
  const exportText = useMemo(() => formatShoppingListForExport(pendingIngredients), [pendingIngredients]);
  const sections = useMemo(
    () =>
      groupShoppingIngredientsByCategory(ingredients).map((group: ShoppingListCategoryGroup) => ({
        ...group,
        title: String(t(CATEGORY_LABELS[group.category])),
        data: group.ingredients,
      })),
    [ingredients, t],
  );

  const periodLabel = useMemo(
    () =>
      t('nutrition.shoppingListRange', {
        start: formatPeriodDate(range.startDate),
        end: formatPeriodDate(range.endDate),
      }),
    [range.endDate, range.startDate, t],
  );

  const movePeriod = useCallback(
    (direction: -1 | 1) => {
      const periodStart = parseISO(range.startDate);
      const nextDate = direction === -1 ? subDays(periodStart, 7) : addDays(periodStart, 7);
      setSelectedDate(format(nextDate, 'yyyy-MM-dd'));
    },
    [range.startDate],
  );

  const renderIngredient = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: ShoppingListIngredient;
      index: number;
      section: { data: ShoppingListIngredient[] };
    }) => (
      <ShoppingListIngredientRow
        item={item}
        isCompleted={completedKeys.has(item.key)}
        disabled={!isHydrated}
        isLast={index === section.data.length - 1}
        colors={colors}
        onToggle={toggleIngredient}
      />
    ),
    [colors, completedKeys, isHydrated, toggleIngredient],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: ShoppingListCategoryGroup & { title: string; data: ShoppingListIngredient[] } }) => (
      <View style={[styles.categoryHeader, { backgroundColor: colors.surfaceSolid }]}>
        <Text style={[styles.categoryTitle, { color: colors.primary }]}>{section.title}</Text>
        <Text style={[styles.categoryCount, { color: colors.textSecondary }]}>
          {t('nutrition.shoppingListIngredientCount', { count: section.data.length })}
        </Text>
      </View>
    ),
    [colors.primary, colors.surfaceSolid, colors.textSecondary, t],
  );

  const keyExtractor = useCallback((item: ShoppingListIngredient) => item.key, []);

  const handleCopy = useCallback(async () => {
    if (!exportText || Platform.OS !== 'web') return;

    try {
      await copyTextToClipboard(exportText);
      Alert.alert(t('common.done'), t('nutrition.shoppingListCopied'));
    } catch {
      Alert.alert(t('common.error'), t('nutrition.shoppingListCopyError'));
    }
  }, [exportText, t]);

  const handleShare = useCallback(async () => {
    if (!exportText) return;

    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ title: t('nutrition.shoppingListShareTitle'), text: exportText });
        } else {
          await handleCopy();
        }
        return;
      }

      await NativeShare.share({
        title: t('nutrition.shoppingListShareTitle'),
        message: exportText,
      });
    } catch {
      // A cancelled native share is not an error that needs to be surfaced.
    }
  }, [exportText, handleCopy, t]);

  const handleCreateAppleReminders = useCallback(() => {
    if (Platform.OS !== 'ios' || pendingIngredients.length === 0) return;

    Alert.prompt(
      t('nutrition.shoppingListAppleRemindersPromptTitle'),
      t('nutrition.shoppingListAppleRemindersPromptMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.save'),
          onPress: (listName: string | undefined) => {
            void (async () => {
              try {
                const result = await createAppleReminders(
                  pendingIngredients.map(ingredient => ({
                    title: ingredient.name,
                    notes: formatShoppingQuantity(ingredient.quantity_g),
                  })),
                  listName?.trim() || 'Compra Josep',
                );
                Alert.alert(
                  t('common.done'),
                  t('nutrition.shoppingListAppleRemindersSuccess', {
                    count: result.created,
                    list: result.listName,
                  }),
                );
              } catch {
                Alert.alert(t('common.error'), t('nutrition.shoppingListAppleRemindersError'));
              }
            })();
          },
        },
      ],
      'plain-text',
      'Compra Josep',
    );
  }, [pendingIngredients, t]);

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={navigation.goBack}
            accessibilityRole="button"
            accessibilityLabel={t('nutrition.shoppingListBackAccessibility')}
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('nutrition.shoppingListTitle')}</Text>
          </View>
          <View style={styles.headerButton} />
        </View>

        <View style={[styles.periodCard, dynamicStyles.glassCard]}>
          <TouchableOpacity
            style={styles.periodButton}
            onPress={() => movePeriod(-1)}
            accessibilityRole="button"
            accessibilityLabel={t('nutrition.shoppingListPreviousPeriod')}
          >
            <ChevronLeft size={20} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.periodCopy}>
            <Text style={[styles.periodLabel, { color: colors.textSecondary }]}>{periodLabel}</Text>
            <Text style={[styles.periodCount, { color: colors.textPrimary }]}>
              {t('nutrition.shoppingListIngredientCount', { count: ingredients.length })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.periodButton}
            onPress={() => movePeriod(1)}
            accessibilityRole="button"
            accessibilityLabel={t('nutrition.shoppingListNextPeriod')}
          >
            <ChevronRight size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {ingredients.length > 0 && (
          <View style={styles.progressRow}>
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>
              {t('nutrition.shoppingListProgress', { completed: completedCount, total: ingredients.length })}
            </Text>
            {completedCount > 0 && (
              <TouchableOpacity
                style={styles.clearCompletedButton}
                onPress={clearCompleted}
                accessibilityRole="button"
                accessibilityLabel={t('nutrition.shoppingListClearCompleted')}
              >
                <RotateCcw size={14} color={colors.primary} strokeWidth={2.2} />
                <Text style={[styles.clearCompletedText, { color: colors.primary }]}>
                  {t('nutrition.shoppingListClearCompleted')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {pendingIngredients.length > 0 && (
          <View style={styles.exportActions}>
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[styles.exportAction, { borderColor: colors.border, backgroundColor: colors.surfaceSolid }]}
                onPress={handleCreateAppleReminders}
                accessibilityRole="button"
                accessibilityLabel={t('nutrition.shoppingListAppleReminders')}
              >
                <ListPlus size={17} color={colors.primary} strokeWidth={2.2} />
                <Text style={[styles.exportActionText, { color: colors.primary }]}>
                  {t('nutrition.shoppingListAppleReminders')}
                </Text>
              </TouchableOpacity>
            )}
            {Platform.OS === 'web' && (
              <TouchableOpacity
                style={[styles.exportAction, { borderColor: colors.border, backgroundColor: colors.surfaceSolid }]}
                onPress={() => void handleCopy()}
                accessibilityRole="button"
                accessibilityLabel={t('nutrition.shoppingListCopy')}
              >
                <Copy size={17} color={colors.primary} strokeWidth={2.2} />
                <Text style={[styles.exportActionText, { color: colors.primary }]}>
                  {t('nutrition.shoppingListCopy')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.exportAction, { borderColor: colors.border, backgroundColor: colors.surfaceSolid }]}
              onPress={() => void handleShare()}
              accessibilityRole="button"
              accessibilityLabel={t('nutrition.shoppingListShare')}
            >
              <Share2 size={17} color={colors.primary} strokeWidth={2.2} />
              <Text style={[styles.exportActionText, { color: colors.primary }]}>
                {t('nutrition.shoppingListShare')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>
              {t('nutrition.shoppingListLoadError')}
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={() => void refetch()}
              accessibilityRole="button"
            >
              <Text style={[styles.retryButtonText, { color: colors.white }]}>{t('nutrition.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : ingredients.length === 0 ? (
          <View style={styles.centerState}>
            <ShoppingBasket size={42} color={colors.textSecondary} strokeWidth={1.8} />
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>{t('nutrition.shoppingListEmpty')}</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            renderItem={renderIngredient}
            renderSectionHeader={renderSectionHeader}
            keyExtractor={keyExtractor}
            contentContainerStyle={[styles.listContent, { paddingBottom: topFromScreenBottom + 32 }]}
            showsVerticalScrollIndicator={false}
            refreshing={isFetching && !isLoading}
            onRefresh={() => void refetch()}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    minHeight: 64,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  periodCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 10,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  periodButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  periodCopy: { flex: 1, alignItems: 'center' },
  periodLabel: { fontSize: 15, fontWeight: '700' },
  periodCount: { fontSize: 13, marginTop: 3 },
  exportActions: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  exportAction: {
    flex: 1,
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  exportActionText: { fontSize: 14, fontWeight: '700' },
  progressRow: {
    minHeight: 32,
    paddingHorizontal: 20,
    marginTop: -7,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  progressText: { flex: 1, fontSize: 13, fontWeight: '600' },
  clearCompletedButton: {
    minHeight: 32,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  clearCompletedText: { fontSize: 13, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingTop: 2 },
  categoryHeader: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 8,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  categoryTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  categoryCount: { fontSize: 12, marginTop: 3 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  stateText: { textAlign: 'center', fontSize: 15, lineHeight: 21 },
  retryButton: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryButtonText: { fontWeight: '700' },
});
