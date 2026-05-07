import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { HealthScreenNavigationProp, TabParamList } from '../../../types/navigation.types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Scale, Ruler, Moon, Plus, BarChart2, ChevronRight, Activity } from 'lucide-react-native';
import { colors, typography } from '../../../theme';

import { useHealthInsights } from '../hooks/useHealthInsights';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard } from '../../../components/GlassCard';
import { LinearGradient } from 'expo-linear-gradient';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { useTranslation } from 'react-i18next';
import { getLocaleTag } from '../../../i18n/dateLocale';

export const HealthHome = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const { latestWeight, weightDelta, avgSleepMinutes, bodyComposition, latestSleep } = useHealthInsights();

  const { convertWeightToUi } = useUnitConversion();
  const { styles: dynamicStyles, colors: themeColors } = useHealthStyles();

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['healthInsights'] });
    setRefreshing(false);
  }, [queryClient]);

  React.useEffect(() => {
    const parent = navigation.getParent<BottomTabNavigationProp<TabParamList>>();
    if (parent) {
      const unsubscribe = parent.addListener('tabPress', () => {
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        });
      });
      return unsubscribe;
    }
  }, [navigation]);

  const getBmiLabel = (cat: string) => {
    switch (cat) {
      case 'underweight':
        return 'Peso inf.';
      case 'normal':
        return 'Normal';
      case 'overweight':
        return 'Sobrepeso';
      case 'obese':
        return 'Obesidad';
      default:
        return '';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(getLocaleTag(), { day: 'numeric', month: 'short' });
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingBottom: 0 }}>
        {/* Top Bar - EXACT COPY FROM NUTRITION */}
        <View style={styles.topBar}>
          <Text style={[styles.headerTitle, dynamicStyles.headerTitle]}>{t('health.summary')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('HealthStatistics')} style={styles.topActions}>
            <BarChart2 size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* 1. Main Weight Card (Clickable -> Stats) */}
          <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('settings.weight')}</Text>
          <GlassCard style={[styles.weightCard, dynamicStyles.glassCard]}>
            <TouchableOpacity
              onPress={() => navigation.navigate('HealthStatistics', { defaultRange: '1M' })}
              activeOpacity={0.7}
            >
              <View style={styles.weightHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Scale size={20} color={themeColors.primary} style={{ marginRight: 8 }} />
                  <Text style={[styles.cardTitle, dynamicStyles.title]}>{t('health.currentWeight')}</Text>
                </View>

                {/* Add Button explicitly requested */}
                <TouchableOpacity
                  onPress={e => {
                    e.stopPropagation(); // Prevent navigating to stats
                    navigation.navigate('WeightAdd');
                  }}
                  style={[styles.addWeightButton, dynamicStyles.iconContainer]}
                >
                  <Plus size={20} color={themeColors.primary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.cardDate, dynamicStyles.subtitle]}>{formatDate(latestWeight?.measured_at)}</Text>

              <View style={styles.weightContent}>
                <Text style={[styles.bigValue, dynamicStyles.title]}>
                  {latestWeight?.weight_kg ? convertWeightToUi(latestWeight.weight_kg).value : '--'}
                </Text>
                <Text style={[styles.unit, dynamicStyles.subtitle]}>
                  {latestWeight?.weight_kg ? convertWeightToUi(latestWeight.weight_kg).unit : t('health.unitKg')}
                </Text>

                {latestWeight && weightDelta && weightDelta.change !== 0 && (
                  <View style={styles.deltaInline}>
                    <Text style={[styles.deltaValue, { color: weightDelta.change <= 0 ? '#10B981' : '#EF4444' }]}>
                      {weightDelta.change > 0 ? '+' : '-'}
                      {convertWeightToUi(Math.abs(weightDelta.change)).value}
                    </Text>
                  </View>
                )}
              </View>

              {weightDelta && (
                <Text style={[styles.comparisonText, dynamicStyles.subtitle]}>
                  {t('health.vs')}
                  {formatDate(weightDelta.previousDate)}
                </Text>
              )}
            </TouchableOpacity>
          </GlassCard>

          {/* 2. Body Composition List (BMI & Fat) -> Leading to Details with RangeBar */}
          <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('health.bodyComposition')}</Text>

          {/* BMI Item */}
          <GlassCard style={[styles.listItemCard, dynamicStyles.glassCard]}>
            <TouchableOpacity
              onPress={() => navigation.navigate('BodyCompositionDetail')}
              activeOpacity={0.7}
              style={styles.listItemRow}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: '#3B82F6' }]}>
                  <Text style={styles.iconBoxText}>{t('health.imc')}</Text>
                </View>
                <View>
                  <Text style={[styles.listItemTitle, dynamicStyles.title]}>{t('health.imc')}</Text>
                  <Text style={[styles.listItemSubtitle, dynamicStyles.subtitle]}>
                    {bodyComposition.bmi ? getBmiLabel(bodyComposition.bmi.category) : t('health.noData')}
                  </Text>
                </View>
              </View>
              <View style={styles.listItemRight}>
                <Text style={[styles.listItemValue, dynamicStyles.title]}>{bodyComposition.bmi?.value || '--'}</Text>
                <ChevronRight size={20} color={themeColors.textSecondary} />
              </View>
            </TouchableOpacity>
          </GlassCard>

          {/* Body Fat Item */}
          <GlassCard style={[styles.listItemCard, dynamicStyles.glassCard]}>
            <TouchableOpacity
              onPress={() => navigation.navigate('BodyCompositionDetail')}
              activeOpacity={0.7}
              style={styles.listItemRow}
            >
              <View style={styles.listItemLeft}>
                <Activity size={24} color={themeColors.secondary} style={{ marginRight: 12 }} />
                <View>
                  <Text style={[styles.listItemTitle, dynamicStyles.title]}>{t('health.bodyFat')}</Text>
                  <Text style={[styles.listItemSubtitle, dynamicStyles.subtitle]}>
                    {bodyComposition.bodyFat?.categoryLabel || '--'}
                  </Text>
                </View>
              </View>
              <View style={styles.listItemRight}>
                <Text style={[styles.listItemValue, dynamicStyles.title]}>
                  {bodyComposition.bodyFat?.percentage ? `${bodyComposition.bodyFat.percentage}%` : '--'}
                </Text>
                <ChevronRight size={20} color={themeColors.textSecondary} />
              </View>
            </TouchableOpacity>
          </GlassCard>

          {/* 3. Measurements */}
          <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('health.measurements')}</Text>
          <GlassCard style={[styles.listItemCard, dynamicStyles.glassCard]}>
            {/* Just a summary link to measurements */}
            <TouchableOpacity
              onPress={() => navigation.navigate('MeasurementAdd')} // Or MeasurementList
              style={styles.listItemRow}
            >
              <View style={styles.listItemLeft}>
                <Ruler size={24} color={themeColors.accent} style={{ marginRight: 12 }} />
                <Text style={[styles.listItemTitle, dynamicStyles.title]}>{t('health.registerMeasurements')}</Text>
              </View>
              <ChevronRight size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </GlassCard>

          {/* 4. Sleep Section */}
          <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('settings.sleep')}</Text>
          <GlassCard style={[styles.sleepCard, dynamicStyles.glassCard]}>
            <TouchableOpacity onPress={() => navigation.navigate('SleepList')} activeOpacity={0.7}>
              <View style={styles.weightHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Moon size={20} color="#8B5CF6" style={{ marginRight: 8 }} />
                  <Text style={[styles.cardTitle, dynamicStyles.title]}>{t('health.lastNight')}</Text>
                </View>
                <TouchableOpacity
                  onPress={e => {
                    e.stopPropagation();
                    navigation.navigate('SleepAdd');
                  }}
                  style={[styles.addWeightButton, dynamicStyles.iconContainer]}
                >
                  <Plus size={20} color="#8B5CF6" />
                </TouchableOpacity>
              </View>

              {latestSleep ? (
                <>
                  <Text style={[styles.cardDate, dynamicStyles.subtitle]}>{formatDate(latestSleep.date)}</Text>
                  <View style={styles.weightContent}>
                    <Text style={[styles.bigValue, dynamicStyles.title]}>
                      {latestSleep.total_sleep_min
                        ? `${Math.floor(latestSleep.total_sleep_min / 60)}h ${latestSleep.total_sleep_min % 60}m`
                        : '--'}
                    </Text>
                  </View>
                  {latestSleep.sleep_score != null && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
                      <View
                        style={{
                          backgroundColor:
                            latestSleep.sleep_score >= 85
                              ? 'rgba(16, 185, 129, 0.15)'
                              : latestSleep.sleep_score >= 70
                                ? 'rgba(245, 158, 11, 0.15)'
                                : 'rgba(239, 68, 68, 0.15)',
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 12,
                          marginRight: 8,
                        }}
                      >
                        <Text
                          style={{
                            color:
                              latestSleep.sleep_score >= 85
                                ? '#10B981'
                                : latestSleep.sleep_score >= 70
                                  ? '#F59E0B'
                                  : '#EF4444',
                            fontWeight: '700',
                            fontSize: 14,
                          }}
                        >
                          {latestSleep.sleep_score}
                        </Text>
                      </View>
                      <Text style={[dynamicStyles.subtitle, { fontSize: 13 }]}>
                        {t('health.sleepScore', 'Sleep Score')}
                      </Text>
                    </View>
                  )}
                  {avgSleepMinutes > 0 && (
                    <Text style={[styles.comparisonText, dynamicStyles.subtitle, { marginTop: 12 }]}>
                      {t('health.avgLast30Days')} {Math.floor(avgSleepMinutes / 60)}h {Math.round(avgSleepMinutes % 60)}
                      m
                    </Text>
                  )}
                </>
              ) : (
                <View style={styles.emptyStateContainer}>
                  <Text style={[styles.emptyStateText, dynamicStyles.subtitle]}>{t('health.noSleepRecords')}</Text>
                  <Text style={[styles.emptyStateHint, dynamicStyles.subtitle]}>{t('health.addFirstSleepRecord')}</Text>
                </View>
              )}
            </TouchableOpacity>
          </GlassCard>
          <Text style={[styles.recommendationText, dynamicStyles.subtitle]}>{t('health.autoCompCalcDisclaimer')}</Text>

          {/* Shortcuts Floating or Bottom? User didn't specify but removed from prominent view to focus on Weight */}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  topActions: {
    position: 'absolute',
    right: 16,
    top: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  content: {
    padding: 20,
    paddingTop: 0,
    paddingBottom: 130,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
    marginTop: 16,
  },
  weightCard: {
    padding: 24,
    marginBottom: 16,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  weightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addWeightButton: {
    padding: 8,
    backgroundColor: colors.background,
    borderRadius: 20,
    marginLeft: 8,
  },
  weightContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  weightDeltaContainer: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  deltaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)', // Fallback
  },
  deltaText: {
    fontSize: 16,
    fontWeight: '700',
  },
  comparisonText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  listItemCard: {
    padding: 0, // List items might have internal padding
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItemTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  listItemSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  listItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItemValue: {
    ...typography.h4,
    color: colors.textPrimary,
    marginRight: 8,
  },
  editButton: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardDate: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  bigValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  unit: {
    fontSize: 20,
    color: colors.textSecondary,
    marginLeft: 4,
    fontWeight: '600',
  },
  iconBox: {
    width: 32,
    height: 20,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconBoxText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  halfCard: {
    flex: 1,
  },
  deltaInline: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  deltaValue: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  // Sleep section styles
  sleepCard: {
    padding: 24,
    marginBottom: 16,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  sleepQualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  qualityLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  qualityStars: {
    flexDirection: 'row',
    gap: 4,
  },
  qualityStar: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  emptyStateContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyStateText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  emptyStateHint: {
    ...typography.caption,
    color: colors.textSecondary,
    opacity: 0.7,
  },
  recommendationText: {
    ...typography.caption,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    marginHorizontal: 8,
    opacity: 0.7,
  },
});
