import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useSettingsGoals, SportGoal } from '../../hooks/settings/useSettingsGoals';
import { Target, ChevronDown, ChevronUp, Plus, Trash2, Info, X } from 'lucide-react-native';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { GOAL_DESCRIPTIONS } from '../../types/onboarding.types';
import { GoalMode, PrimaryGoalMode, SportType } from '../../types/requests.types';
import { Nullable } from '../../types/common.types';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { TranslationKey } from '../../i18n/locales/en';

const MAIN_GOALS: { value: PrimaryGoalMode; labelKey: TranslationKey }[] = [
  { value: 'gain_strength', labelKey: 'onboarding.goals.gainStrength.label' },
  { value: 'gain_muscle', labelKey: 'onboarding.goals.gainMuscle.label' },
  { value: 'recomp', labelKey: 'onboarding.goals.recomp.label' },
  { value: 'lose_weight', labelKey: 'onboarding.goals.loseWeight.label' },
  { value: 'maintain', labelKey: 'onboarding.goals.maintain.label' },
];

// Base distances in meters - will be converted to user's preferred unit
const RUNNING_DISTANCES_M = [5000, 10000, 15000, 21097, 42195];
const CYCLING_DISTANCES_M = [20000, 50000, 100000, 150000, 200000];
const SWIMMING_DISTANCES_M = [500, 1000, 1500, 3000];

const SectionHeader = ({ title }: { title: string }) => {
  const { styles: dynamicStyles } = useSettingsStyles();
  return <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{title.toUpperCase()}</Text>;
};

const MainGoalCard = ({
  label,
  selected,
  onSelect,
  onInfoPress,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  onInfoPress: () => void;
}) => {
  const { colors: themeColors, isDark } = useSettingsStyles();

  return (
    <TouchableOpacity
      style={[
        styles.mainGoalCard,
        { backgroundColor: isDark ? themeColors.surfaceSolid : colors.white },
        selected && styles.mainGoalCardSelected,
      ]}
      onPress={onSelect}
    >
      <Target size={20} color={selected ? colors.white : themeColors.primary} />
      <Text
        style={[
          styles.mainGoalText,
          { color: themeColors.textPrimary, flex: 1 },
          selected && styles.mainGoalTextSelected,
        ]}
      >
        {label}
      </Text>
      <TouchableOpacity
        onPress={e => {
          e.stopPropagation();
          onInfoPress();
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Info size={18} color={selected ? 'rgba(255,255,255,0.7)' : themeColors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

interface SportSectionProps {
  title: string;
  icon: string;
  sportType: SportType;
  distancesM: number[];
  goals: SportGoal[];
  onAddGoal: (distance: number, timeSeconds?: number | null) => void;
  onDeleteGoal: (id: string) => void;
  showPower?: boolean;
  formatDistance: (meters: number) => string;
}

const SportSection = ({
  title,
  icon,
  distancesM,
  goals,
  onAddGoal,
  onDeleteGoal,
  formatDistance,
  sportType,
}: SportSectionProps) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(goals.length > 0);
  const [selectedDistance, setSelectedDistance] = useState<number | null>(null);
  const [inputType, setInputType] = useState<'time' | 'pace_speed'>('time');
  const [timeInput, setTimeInput] = useState('');
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const [inputError, setInputError] = useState(false);
  const { colors: themeColors, isDark } = useSettingsStyles();

  const parseTimeToSeconds = (timeStr: string): number | null => {
    // Format: hh:mm:ss or mm:ss
    const parts = timeStr.split(':').map(p => parseInt(p.trim(), 10));
    if (parts.some(isNaN)) return null;

    if (parts.length === 3) {
      // hh:mm:ss
      const [h, m, s] = parts;
      return h * 3600 + m * 60 + s;
    } else if (parts.length === 2) {
      // mm:ss
      const [m, s] = parts;
      return m * 60 + s;
    }
    return null;
  };

  const calculateDurationFromPaceSpeed = (
    inputType: 'pace_speed',
    valueStr: string,
    distMeters: number,
    sportType: SportType,
  ): number | null => {
    if (!valueStr) return null;

    if (sportType === 'cycling') {
      // Input is Speed (km/h)
      const speedKmh = parseFloat(valueStr.replace(',', '.'));
      if (isNaN(speedKmh) || speedKmh <= 0) return null;
      const distKm = distMeters / 1000;
      const hours = distKm / speedKmh;
      return Math.round(hours * 3600);
    } else if (sportType === 'running') {
      // Input is Pace (min:sec / km)
      const paceParts = valueStr.split(':').map(p => parseInt(p.trim(), 10));
      if (paceParts.length !== 2 || paceParts.some(isNaN)) return null;
      const paceSecondsPerKm = paceParts[0] * 60 + paceParts[1];
      const distKm = distMeters / 1000;
      return Math.round(distKm * paceSecondsPerKm);
    } else if (sportType === 'swimming') {
      // Input is Pace (min:sec / 100m)
      const paceParts = valueStr.split(':').map(p => parseInt(p.trim(), 10));
      if (paceParts.length !== 2 || paceParts.some(isNaN)) return null;
      const paceSecondsPer100m = paceParts[0] * 60 + paceParts[1];
      const hundreds = distMeters / 100;
      return Math.round(hundreds * paceSecondsPer100m);
    }
    return null;
  };

  const handleAddGoal = () => {
    if (!selectedDistance) return;

    let timeSeconds: number | null = null;

    if (inputType === 'time') {
      timeSeconds = timeInput ? parseTimeToSeconds(timeInput) : null;
    } else {
      timeSeconds = calculateDurationFromPaceSpeed('pace_speed', timeInput, selectedDistance, sportType);
    }

    if (inputError) {
      Alert.alert(t('common.error'), t('settings.invalidInputFormat'));
      return;
    }

    if (timeInput && !timeSeconds) {
      Alert.alert(t('common.error'), t('settings.couldNotCalculateTime'));
      return;
    }

    onAddGoal(selectedDistance, timeSeconds);
    setSelectedDistance(null);
    setTimeInput('');
    setEstimatedTime(null);
  };

  // Dynamic Validation & Estimation
  React.useEffect(() => {
    if (!timeInput || !selectedDistance) {
      setEstimatedTime(null);
      setInputError(false);
      return;
    }

    if (inputType === 'time') {
      const secs = parseTimeToSeconds(timeInput);
      setInputError(!secs);
      setEstimatedTime(null); // No estimation needed for direct time
    } else {
      // Pace/Speed validation
      let isValid = false;
      if (sportType === 'cycling') {
        // Float check
        isValid = /^\d+([.,]\d+)?$/.test(timeInput);
      } else {
        // MM:SS check
        isValid = /^\d{1,2}:[0-5]\d$/.test(timeInput);
      }

      setInputError(!isValid);

      // Calculate immediately if valid
      if (isValid) {
        const calculatedSecs = calculateDurationFromPaceSpeed('pace_speed', timeInput, selectedDistance, sportType);
        setEstimatedTime(calculatedSecs);
      } else {
        setEstimatedTime(null);
      }
    }
  }, [timeInput, inputType, selectedDistance, sportType]);

  return (
    <View style={[styles.sportCard, { backgroundColor: isDark ? themeColors.surfaceSolid : colors.white }]}>
      <TouchableOpacity style={styles.sportHeader} onPress={() => setExpanded(!expanded)}>
        <View style={styles.sportHeaderLeft}>
          <Text style={styles.sportIcon}>{icon}</Text>
          <Text style={[styles.sportTitle, { color: themeColors.textPrimary }]}>{title}</Text>
          {goals.length > 0 && (
            <View style={styles.goalBadge}>
              <Text style={styles.goalBadgeText}>{goals.length}</Text>
            </View>
          )}
        </View>
        {expanded ? (
          <ChevronUp size={20} color={themeColors.textSecondary} />
        ) : (
          <ChevronDown size={20} color={themeColors.textSecondary} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.sportContent, { borderTopColor: themeColors.border }]}>
          {/* Existing goals */}
          {goals.map(goal => (
            <View key={goal.id} style={[styles.goalItem, { borderBottomColor: themeColors.border }]}>
              <View style={styles.goalInfo}>
                <Text style={[styles.goalDistance, { color: themeColors.textPrimary }]}>
                  {formatDistance(goal.target_distance_m)}
                </Text>
                {goal.target_time_s && (
                  <Text style={[styles.goalTime, { color: themeColors.textSecondary }]}>
                    {t('settings.goal')}
                    {formatTime(goal.target_time_s)}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => onDeleteGoal(goal.id)}>
                <Trash2 size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add new goal */}
          <View style={styles.addGoalSection}>
            <Text style={[styles.addGoalLabel, { color: themeColors.textSecondary }]}>{t('settings.addGoal')}</Text>
            <View style={styles.distanceOptions}>
              {distancesM.map(meters => (
                <TouchableOpacity
                  key={meters}
                  style={[
                    styles.distanceOption,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.background },
                    selectedDistance === meters && styles.distanceOptionSelected,
                  ]}
                  onPress={() => setSelectedDistance(meters)}
                >
                  <Text
                    style={[
                      styles.distanceOptionText,
                      { color: themeColors.textSecondary },
                      selectedDistance === meters && styles.distanceOptionTextSelected,
                    ]}
                  >
                    {formatDistance(meters)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedDistance && (
              <>
                <View style={styles.timeInputContainer}>
                  <View style={styles.inputTypeToggle}>
                    <TouchableOpacity
                      style={[styles.inputTypeOption, inputType === 'time' && styles.inputTypeOptionSelected]}
                      onPress={() => {
                        setInputType('time');
                        setTimeInput('');
                      }}
                    >
                      <Text style={[styles.inputTypeText, inputType === 'time' && styles.inputTypeTextSelected]}>
                        {t('settings.byTime')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.inputTypeOption, inputType === 'pace_speed' && styles.inputTypeOptionSelected]}
                      onPress={() => {
                        setInputType('pace_speed');
                        setTimeInput('');
                      }}
                    >
                      <Text style={[styles.inputTypeText, inputType === 'pace_speed' && styles.inputTypeTextSelected]}>
                        {sportType === 'running'
                          ? t('settings.paceUnitRunning')
                          : sportType === 'cycling'
                            ? t('settings.speedUnitKmH')
                            : t('settings.paceSwimming')}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.timeInputLabel, { color: themeColors.textSecondary }]}>
                    {inputType === 'time'
                      ? t('settings.targetTime')
                      : sportType === 'cycling'
                        ? t('settings.averageSpeed')
                        : t('settings.targetPace')}
                  </Text>
                  <View style={styles.inputWithSuffix}>
                    <TextInput
                      style={[
                        styles.timeInput,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.background,
                          color: themeColors.textPrimary,
                          borderColor: inputError ? colors.danger : 'transparent',
                          borderWidth: 1,
                          flex: 1,
                        },
                      ]}
                      value={timeInput}
                      onChangeText={setTimeInput}
                      placeholder={inputType === 'time' ? 'hh:mm:ss' : sportType === 'cycling' ? '30.5' : '5:00'}
                      placeholderTextColor={themeColors.textSecondary}
                      keyboardType="numbers-and-punctuation"
                    />
                    {inputType === 'pace_speed' && (
                      <Text style={[styles.inputSuffixText, { color: themeColors.textSecondary }]}>
                        {sportType === 'running'
                          ? t('settings.unitKm')
                          : sportType === 'cycling'
                            ? t('settings.unitKmH')
                            : t('settings.unit100m')}
                      </Text>
                    )}
                  </View>

                  {estimatedTime !== null && inputType === 'pace_speed' && (
                    <Text style={[styles.estimatedTimeText, { color: themeColors.primary }]}>
                      {t('settings.estimatedTime')}
                      {formatTime(estimatedTime)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity style={styles.addButton} onPress={handleAddGoal}>
                  <Plus size={16} color={colors.white} />
                  <Text style={styles.addButtonText}>{t('nutrition.add')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const formatTime = (seconds: number): string => {
  const normalizedSeconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(normalizedSeconds / 3600);
  const m = Math.floor((normalizedSeconds % 3600) / 60);
  const s = normalizedSeconds % 60;
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const ObjectivesSettingsScreen = () => {
  const { t } = useTranslation();
  const { goals, loading, updateMainGoal, addSportGoal, deleteSportGoal, updateNutritionGoals } = useSettingsGoals();
  const { colors: themeColors, isDark } = useSettingsStyles();

  const { convertDistanceToUi } = useUnitConversion();

  // Helper to format distance based on user preferences
  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${meters} m`;
    }
    const converted = convertDistanceToUi(meters, 1); // Pass meters directly
    return `${converted.value} ${converted.unit}`;
  };
  const queryClient = useQueryClient();

  // Local State
  const [calories, setCalories] = useState(goals.nutritionGoals.target_calories_kcal?.toString() || '');
  const [protein, setProtein] = useState(goals.nutritionGoals.target_protein_g?.toString() || '');
  const [carbs, setCarbs] = useState(goals.nutritionGoals.target_carbs_g?.toString() || '');
  const [fats, setFats] = useState(goals.nutritionGoals.target_fats_g?.toString() || '');
  const [nutritionFocus, setNutritionFocus] = useState<Nullable<GoalMode>>(goals.nutritionGoals.focus);

  // Goal Info Modal State
  const [infoModalGoal, setInfoModalGoal] = useState<Nullable<PrimaryGoalMode>>(null);

  // Update local state when goals load
  React.useEffect(() => {
    setCalories(goals.nutritionGoals.target_calories_kcal?.toString() || '');
    setProtein(goals.nutritionGoals.target_protein_g?.toString() || '');
    setCarbs(goals.nutritionGoals.target_carbs_g?.toString() || '');
    setFats(goals.nutritionGoals.target_fats_g?.toString() || '');
    setNutritionFocus(goals.nutritionGoals.focus);
  }, [goals.nutritionGoals]);

  const handleSaveNutrition = async () => {
    const success = await updateNutritionGoals({
      target_calories_kcal: calories ? parseInt(calories, 10) : null,
      target_protein_g: protein ? parseInt(protein, 10) : null,
      target_carbs_g: carbs ? parseInt(carbs, 10) : null,
      target_fats_g: fats ? parseInt(fats, 10) : null,
      focus: nutritionFocus,
    });

    if (success) {
      queryClient.invalidateQueries({ queryKey: ['globalNutritionGoals'] });
      Alert.alert(t('common.done'), t('settings.goalsUpdatedSuccess'));
    }
  };

  const runningGoals = goals.sportGoals.filter(g => g.sport_type === 'running');
  const cyclingGoals = goals.sportGoals.filter(g => g.sport_type === 'cycling');
  const swimmingGoals = goals.sportGoals.filter(g => g.sport_type === 'swimming');

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Main Goal Section */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.mainGoal')} />
            <View style={styles.mainGoalsContainer}>
              {MAIN_GOALS.map(g => (
                <MainGoalCard
                  key={g.value}
                  label={t(g.labelKey)}
                  selected={goals.mainGoal === g.value}
                  onSelect={() => updateMainGoal(g.value)}
                  onInfoPress={() => setInfoModalGoal(g.value)}
                />
              ))}
            </View>
          </View>

          {/* Sport Goals Section */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.sportGoals')} />

            <SportSection
              title={t('constants.running')}
              icon="🏃"
              sportType="running"
              distancesM={RUNNING_DISTANCES_M}
              goals={runningGoals}
              formatDistance={formatDistance}
              onAddGoal={(distance, timeSeconds) =>
                addSportGoal({
                  sport_type: 'running',
                  target_distance_m: distance,
                  target_time_s: timeSeconds ?? null,
                  target_power_w: null,
                  is_active: true,
                  description: null,
                })
              }
              onDeleteGoal={deleteSportGoal}
            />

            <SportSection
              title={t('constants.cycling')}
              icon="🚴"
              sportType="cycling"
              distancesM={CYCLING_DISTANCES_M}
              goals={cyclingGoals}
              formatDistance={formatDistance}
              onAddGoal={(distance, timeSeconds) =>
                addSportGoal({
                  sport_type: 'cycling',
                  target_distance_m: distance,
                  target_time_s: timeSeconds ?? null,
                  target_power_w: null,
                  is_active: true,
                  description: null,
                })
              }
              onDeleteGoal={deleteSportGoal}
              showPower
            />

            <SportSection
              title={t('constants.swimming')}
              icon="🏊"
              sportType="swimming"
              distancesM={SWIMMING_DISTANCES_M}
              goals={swimmingGoals}
              formatDistance={formatDistance}
              onAddGoal={(distance, timeSeconds) =>
                addSportGoal({
                  sport_type: 'swimming',
                  target_distance_m: distance,
                  target_time_s: timeSeconds ?? null,
                  target_power_w: null,
                  is_active: true,
                  description: null,
                })
              }
              onDeleteGoal={deleteSportGoal}
            />
          </View>

          {/* Nutrition Goals Section */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.nutritionGoals')} />
            <View style={[styles.card, { backgroundColor: isDark ? themeColors.surfaceSolid : colors.white }]}>
              {/* Calories */}
              <View style={styles.nutritionRow}>
                <Text style={[styles.nutritionLabel, { color: themeColors.textPrimary }]}>
                  {t('settings.dailyCalories')}
                </Text>
                <View style={styles.nutritionInputWrapper}>
                  <TextInput
                    style={[styles.nutritionInput, { color: themeColors.textPrimary }]}
                    value={calories}
                    onChangeText={setCalories}
                    placeholder="2000"
                    placeholderTextColor={themeColors.textSecondary}
                    keyboardType="numeric"
                  />
                  <Text style={[styles.nutritionUnit, { color: themeColors.textSecondary }]}>
                    {t('nutrition.kcal')}
                  </Text>
                </View>
              </View>

              <View style={[styles.nutritionDivider, { backgroundColor: themeColors.border }]} />

              {/* Protein */}
              <View style={styles.nutritionRow}>
                <Text style={[styles.nutritionLabel, { color: themeColors.textPrimary }]}>
                  {t('nutrition.proteins')}
                </Text>
                <View style={styles.nutritionInputWrapper}>
                  <TextInput
                    style={[styles.nutritionInput, { color: themeColors.textPrimary }]}
                    value={protein}
                    onChangeText={setProtein}
                    placeholder="150"
                    placeholderTextColor={themeColors.textSecondary}
                    keyboardType="numeric"
                  />
                  <Text style={[styles.nutritionUnit, { color: themeColors.textSecondary }]}>g</Text>
                </View>
              </View>

              <View style={[styles.nutritionDivider, { backgroundColor: themeColors.border }]} />

              {/* Carbs */}
              <View style={styles.nutritionRow}>
                <Text style={[styles.nutritionLabel, { color: themeColors.textPrimary }]}>{t('nutrition.carbs')}</Text>
                <View style={styles.nutritionInputWrapper}>
                  <TextInput
                    style={[styles.nutritionInput, { color: themeColors.textPrimary }]}
                    value={carbs}
                    onChangeText={setCarbs}
                    placeholder="200"
                    placeholderTextColor={themeColors.textSecondary}
                    keyboardType="numeric"
                  />
                  <Text style={[styles.nutritionUnit, { color: themeColors.textSecondary }]}>g</Text>
                </View>
              </View>

              <View style={[styles.nutritionDivider, { backgroundColor: themeColors.border }]} />

              {/* Fats */}
              <View style={styles.nutritionRow}>
                <Text style={[styles.nutritionLabel, { color: themeColors.textPrimary }]}>{t('nutrition.fats')}</Text>
                <View style={styles.nutritionInputWrapper}>
                  <TextInput
                    style={[styles.nutritionInput, { color: themeColors.textPrimary }]}
                    value={fats}
                    onChangeText={setFats}
                    placeholder="70"
                    placeholderTextColor={themeColors.textSecondary}
                    keyboardType="numeric"
                  />
                  <Text style={[styles.nutritionUnit, { color: themeColors.textSecondary }]}>g</Text>
                </View>
              </View>

              <View style={[styles.buttonRow, { justifyContent: 'center' }]}>
                <TouchableOpacity style={styles.saveNutritionButton} onPress={handleSaveNutrition}>
                  <Text style={styles.saveNutritionButtonText}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Goal Info Modal */}
        <Modal
          visible={infoModalGoal !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setInfoModalGoal(null)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setInfoModalGoal(null)}>
            <View
              style={[styles.infoModalContent, { backgroundColor: isDark ? themeColors.surfaceSolid : colors.white }]}
            >
              {infoModalGoal && (
                <>
                  {(() => {
                    const goalInfo = GOAL_DESCRIPTIONS[infoModalGoal];
                    return (
                      <>
                        <View style={styles.infoModalHeader}>
                          <Text style={{ fontSize: 32 }}>{goalInfo.icon}</Text>
                          <Text style={[styles.infoModalTitle, { color: themeColors.textPrimary }]}>
                            {t(goalInfo.titleKey)}
                          </Text>
                          <TouchableOpacity onPress={() => setInfoModalGoal(null)} style={styles.infoModalClose}>
                            <X size={20} color={themeColors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.infoModalShort, { color: themeColors.primary }]}>
                          {t(goalInfo.shortDescriptionKey)}
                        </Text>
                        <Text style={[styles.infoModalLong, { color: themeColors.textSecondary }]}>
                          {t(goalInfo.longDescriptionKey)}
                        </Text>
                      </>
                    );
                  })()}
                </>
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Background handled by LinearGradient
  },
  safeArea: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: spacing.m,
    paddingBottom: 120,
  },
  section: {
    marginBottom: spacing.l,
  },
  sectionHeader: {
    ...typography.caption,
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  mainGoalsContainer: {
    gap: spacing.s,
  },
  mainGoalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    backgroundColor: colors.white,
    borderRadius: borderRadius.m,
    gap: spacing.m,
    ...shadows.soft,
  },
  mainGoalCardSelected: {
    backgroundColor: colors.primary,
  },
  mainGoalText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  mainGoalTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  mainGoalDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  sportCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.m,
    marginBottom: spacing.s,
    ...shadows.soft,
    overflow: 'hidden',
  },
  sportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
  },
  sportHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  sportIcon: {
    fontSize: 20,
  },
  sportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  goalBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  goalBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  sportContent: {
    padding: spacing.m,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  goalInfo: {
    flex: 1,
  },
  goalDistance: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  goalTime: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addGoalSection: {
    marginTop: spacing.m,
  },
  addGoalLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.s,
  },
  distanceOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  distanceOption: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
  },
  distanceOptionSelected: {
    backgroundColor: colors.primary,
  },
  distanceOptionText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  distanceOptionTextSelected: {
    color: colors.white,
    fontWeight: '500',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.s,
    padding: spacing.s,
    marginTop: spacing.m,
    gap: spacing.xs,
  },
  addButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    ...shadows.soft,
  },
  inputGroup: {
    marginBottom: spacing.m,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.s,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.s,
    padding: spacing.m,
    fontSize: 16,
    color: colors.textPrimary,
  },
  macrosTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.s,
  },
  macrosRow: {
    flexDirection: 'row',
    gap: spacing.s,
    marginBottom: spacing.m,
  },
  macroInput: {
    flex: 1,
  },
  macroLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  focusOptions: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  focusOption: {
    flex: 1,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.s,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  focusOptionSelected: {
    backgroundColor: colors.primary,
  },
  focusOptionText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  focusOptionTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.m,
    alignItems: 'center',
    marginTop: spacing.s,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.m,
    marginTop: spacing.m,
  },
  calculateButton: {
    flex: 1,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.m,
    alignItems: 'center',
  },
  calculateButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveNutritionButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.m,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  timeInputContainer: {
    marginTop: spacing.s,
    gap: spacing.xs,
  },
  timeInputLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  timeInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.s,
    padding: spacing.s,
    fontSize: 14,
    color: colors.textPrimary,
  },
  inputTypeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: borderRadius.s,
    padding: 2,
    marginBottom: spacing.s,
  },
  inputTypeOption: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: borderRadius.s - 2,
  },
  inputTypeOptionSelected: {
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  inputTypeText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  inputTypeTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  inputWithSuffix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  inputSuffixText: {
    fontSize: 14,
    fontWeight: '500',
  },
  estimatedTimeText: {
    fontSize: 13,
    marginTop: 4,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  // Minimalist nutrition styles
  nutritionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.m,
  },
  nutritionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    flex: 1,
  },
  nutritionInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nutritionInput: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'right',
    minWidth: 60,
  },
  nutritionUnit: {
    fontSize: 14,
    color: colors.textSecondary,
    width: 40,
  },
  nutritionDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  focusSectionMinimal: {
    paddingVertical: spacing.m,
    alignItems: 'center',
  },
  nutritionLabelCentered: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: spacing.m,
    textAlign: 'center',
  },
  focusOptionsCentered: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
    justifyContent: 'center',
    width: '100%',
  },
  focusChip: {
    width: '48%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: borderRadius.m,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  focusChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  focusChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  focusChipTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },

  saveNutritionButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },

  // Goal Info Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
  },
  infoModalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: borderRadius.l,
    padding: spacing.l,
    ...shadows.soft,
  },
  infoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.m,
    gap: spacing.s,
  },
  infoModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  infoModalClose: {
    padding: spacing.xs,
  },
  infoModalShort: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.s,
  },
  infoModalLong: {
    fontSize: 14,
    lineHeight: 20,
  },
});
