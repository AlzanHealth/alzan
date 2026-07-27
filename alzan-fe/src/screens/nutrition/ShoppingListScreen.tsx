import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ChevronRight, ShoppingBasket } from 'lucide-react-native';
import { addDays, format, parseISO, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';

import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import { useShoppingList } from '../../modules/nutrition/hooks/useShoppingList';
import {
  formatShoppingQuantity,
  groupShoppingIngredientsByCategory,
  type ShoppingListCategoryGroup,
  type ShoppingListIngredient,
} from '../../modules/nutrition/services/shoppingListPlanner';
import { CATEGORY_LABELS } from '../../modules/nutrition/components/IngredientCategoryFilter';
import { formatLocalizedDate } from '../../i18n/dateLocale';
import { useTabBarLayout } from '../../navigation/tabBarLayout';
import type { NutritionScreenNavigationProp, NutritionStackParamList } from '../../types/navigation.types';

const formatPeriodDate = (date: string) =>
  formatLocalizedDate(parseISO(date), {
    en: 'EEE d MMM',
    es: 'EEE d MMM',
  });

export const ShoppingListScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NutritionScreenNavigationProp>();
  const route = useRoute<RouteProp<NutritionStackParamList, 'ShoppingList'>>();
  const { styles: dynamicStyles, colors } = useNutritionStyles();
  const { topFromScreenBottom } = useTabBarLayout();
  const initialDate = route.params?.date || format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const { error, isLoading, isFetching, refetch, range, ingredients } = useShoppingList(selectedDate);
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
      <View
        style={[
          styles.ingredientRow,
          index === section.data.length - 1 && styles.ingredientLastRow,
          { backgroundColor: colors.surfaceSolid, borderBottomColor: colors.border },
        ]}
      >
        <View style={[styles.ingredientBullet, { backgroundColor: colors.primary }]} />
        <Text style={[styles.ingredientName, { color: colors.textPrimary }]}>{item.name}</Text>
        <Text style={[styles.ingredientQuantity, { color: colors.primary }]}>
          {formatShoppingQuantity(item.quantity_g)}
        </Text>
      </View>
    ),
    [colors.border, colors.primary, colors.surfaceSolid, colors.textPrimary],
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
  ingredientRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ingredientLastRow: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  ingredientBullet: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 12,
  },
  ingredientName: { flex: 1, fontSize: 16, fontWeight: '600' },
  ingredientQuantity: { fontSize: 15, fontWeight: '800' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  stateText: { textAlign: 'center', fontSize: 15, lineHeight: 21 },
  retryButton: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryButtonText: { fontWeight: '700' },
});
