import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { Alert } from '../../components/common/Alert';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS } from '../../utils/numericInput';
import { borderRadius, colors, spacing, typography } from '../../theme';
import {
  useDeleteExerciseWeightEntry,
  useExerciseWeightEntries,
  useUpdateExerciseWeightEntry,
} from '../../hooks/useExerciseProgress';
import { formatDuration } from '../../constants/sports';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';

const parseDurationInputSeconds = (rawInput: string): number => {
  const normalizedInput = rawInput.trim().replace(',', '.');

  if (!normalizedInput) {
    return 0;
  }

  if (normalizedInput.includes(':')) {
    const parts = normalizedInput.split(':');

    if (parts.length < 2 || parts.length > 3) {
      return Number.NaN;
    }

    const parsedParts = parts.map(part => Number.parseInt(part, 10));
    if (parsedParts.some(value => Number.isNaN(value) || value < 0)) {
      return Number.NaN;
    }

    if (parts.length === 2) {
      return parsedParts[0] * 60 + parsedParts[1];
    }

    return parsedParts[0] * 3600 + parsedParts[1] * 60 + parsedParts[2];
  }

  const parsedSeconds = Number.parseFloat(normalizedInput);
  if (Number.isNaN(parsedSeconds) || parsedSeconds < 0) {
    return Number.NaN;
  }

  return Math.round(parsedSeconds);
};

export const ExercisePrValuesScreen = () => {
  const { t } = useTranslation();
  const locale = getDateFnsLocale();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'ExercisePrValues'>>();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const { preferences, toDisplayWeight } = useUserPreferences();

  const { exerciseId, metric, loadType, exerciseName } = route.params;
  const [editingWeightEntryId, setEditingWeightEntryId] = useState<string | null>(null);
  const [editingWeightValue, setEditingWeightValue] = useState('');

  const {
    data: weightEntriesData,
    isLoading: weightEntriesLoading,
    isError: weightEntriesError,
    refetch: refetchWeightEntries,
  } = useExerciseWeightEntries(exerciseId, metric, loadType ?? null);
  const updateWeightEntry = useUpdateExerciseWeightEntry(exerciseId, metric);
  const deleteWeightEntry = useDeleteExerciseWeightEntry(exerciseId, metric);
  const weightEntries = weightEntriesData?.entries ?? [];

  const formatWeightValue = (kg: number) =>
    toDisplayWeight(kg).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const beginEditWeightEntry = (entry: (typeof weightEntries)[number]) => {
    setEditingWeightEntryId(entry.id);

    if (metric === 'time') {
      setEditingWeightValue(entry.durationSeconds > 0 ? formatDuration(Math.round(entry.durationSeconds)) : '');
      return;
    }

    if (metric === 'reps') {
      setEditingWeightValue(entry.reps != null && entry.reps > 0 ? String(entry.reps) : '');
      return;
    }

    setEditingWeightValue(entry.weightKg > 0 ? formatWeightValue(entry.weightKg) : '');
  };

  const cancelEditWeightEntry = () => {
    setEditingWeightEntryId(null);
    setEditingWeightValue('');
  };

  const saveEditedWeightEntry = (entryId: string) => {
    const parsed =
      metric === 'time'
        ? parseDurationInputSeconds(editingWeightValue)
        : metric === 'reps'
          ? (() => {
              const normalized = editingWeightValue.trim().replace(',', '.');
              return normalized === '' ? 0 : Number.parseInt(normalized, 10);
            })()
          : (() => {
              const normalized = editingWeightValue.trim().replace(',', '.');
              return normalized === '' ? 0 : Number.parseFloat(normalized);
            })();

    if (Number.isNaN(parsed) || parsed < 0) {
      Alert.alert(
        t(
          metric === 'time'
            ? 'training.invalidTimeValueTitle'
            : metric === 'reps'
              ? 'training.invalidRepsTitle'
              : 'training.invalidWeightTitle',
        ),
        t(
          metric === 'time'
            ? 'training.invalidTimeValueMessage'
            : metric === 'reps'
              ? 'training.invalidRepsMessage'
              : 'training.invalidWeightMessage',
        ),
      );
      return;
    }

    const dbValue = metric === 'weight' && preferences.weight_unit === 'lb' ? parsed / 2.20462 : parsed;

    updateWeightEntry.mutate(
      { setId: entryId, value: dbValue },
      {
        onSuccess: () => {
          cancelEditWeightEntry();
        },
      },
    );
  };

  const confirmDeleteWeightEntry = (entryId: string) => {
    Alert.alert(t('training.deletePrValueTitle'), t('training.deletePrValueMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteWeightEntry.mutate(
            { setId: entryId },
            {
              onSuccess: () => {
                if (editingWeightEntryId === entryId) {
                  cancelEditWeightEntry();
                }
              },
            },
          );
        },
      },
    ]);
  };

  const confirmClearWeightEntry = (entry: (typeof weightEntries)[number]) => {
    if (metric !== 'weight' || entry.isEmptyWeight || entry.weightKg <= 0) return;

    Alert.alert(t('training.exerciseCatalogRemoveWeightTitle'), t('training.exerciseCatalogRemoveWeightMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('training.exerciseCatalogRemoveWeightAction'),
        onPress: () => {
          updateWeightEntry.mutate(
            { setId: entry.id, value: 0 },
            {
              onSuccess: () => {
                if (editingWeightEntryId === entry.id) {
                  cancelEditWeightEntry();
                }
              },
            },
          );
        },
      },
    ]);
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.title, dynamicStyles.title]} numberOfLines={1}>
              {t('training.prValuesHistoryTitle')}
            </Text>
            {exerciseName ? (
              <Text style={[styles.subtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                {exerciseName}
              </Text>
            ) : null}
          </View>
          <View style={styles.backBtn} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>
              {t('training.prValuesHistorySubtitle')}
            </Text>

            {weightEntriesLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={themeColors.primary} />
              </View>
            ) : weightEntriesError && !weightEntriesData ? (
              <View style={styles.loadingWrap}>
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  {t('training.prValuesHistoryLoadError')}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => void refetchWeightEntries()}
                  style={[styles.retryButton, { borderColor: themeColors.border }]}
                >
                  <Text style={[styles.retryButtonText, { color: themeColors.primary }]}>{t('nutrition.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : weightEntries.length === 0 ? (
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                {t('training.prValuesHistoryEmpty')}
              </Text>
            ) : (
              weightEntries.map(entry => {
                const isEditingEntry = editingWeightEntryId === entry.id;
                const isUpdatingCurrent = updateWeightEntry.isPending && isEditingEntry;

                return (
                  <View
                    key={entry.id}
                    style={[
                      styles.valueRow,
                      {
                        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.valueDate, { color: themeColors.textSecondary }]}>
                        {format(new Date(entry.date), 'd MMM yyyy · HH:mm', { locale })}
                      </Text>

                      {isEditingEntry ? (
                        <View style={styles.editingRow}>
                          <TextInput
                            style={[
                              styles.valueInput,
                              {
                                color: themeColors.textPrimary,
                                borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)',
                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.92)',
                              },
                            ]}
                            value={editingWeightValue}
                            onChangeText={setEditingWeightValue}
                            keyboardType={
                              metric === 'time'
                                ? 'numbers-and-punctuation'
                                : metric === 'reps'
                                  ? 'number-pad'
                                  : 'decimal-pad'
                            }
                            inputMode={
                              metric === 'reps' ? INTEGER_INPUT_PROPS.inputMode : DECIMAL_INPUT_PROPS.inputMode
                            }
                            placeholder={t(
                              metric === 'time'
                                ? 'training.emptyTimeValue'
                                : metric === 'reps'
                                  ? 'training.emptyRepsValue'
                                  : 'training.emptyWeightValue',
                            )}
                            placeholderTextColor={themeColors.textSecondary}
                            selectTextOnFocus
                          />
                          <Text style={[styles.valueInputUnit, { color: themeColors.textSecondary }]}>
                            {metric === 'time'
                              ? 'mm:ss'
                              : metric === 'reps'
                                ? t('training.repsColon')
                                : preferences.weight_unit}
                          </Text>
                        </View>
                      ) : (
                        <Text style={[styles.valueMain, { color: themeColors.textPrimary }]}>
                          {metric === 'time'
                            ? entry.isEmptyDuration
                              ? t('training.emptyTimeValue')
                              : formatDuration(Math.round(entry.durationSeconds))
                            : metric === 'reps'
                              ? entry.isEmptyReps
                                ? t('training.emptyRepsValue')
                                : `${entry.reps} ${t('training.repsColon')}`
                              : entry.isEmptyWeight
                                ? t('training.emptyWeightValue')
                                : `${formatWeightValue(entry.normalizedWeightKg ?? entry.weightKg)} ${preferences.weight_unit}`}
                        </Text>
                      )}
                    </View>

                    <View style={styles.valueActions}>
                      {isEditingEntry ? (
                        <>
                          <TouchableOpacity
                            style={[
                              styles.actionTextBtn,
                              { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
                            ]}
                            onPress={cancelEditWeightEntry}
                            disabled={updateWeightEntry.isPending}
                          >
                            <Text style={[styles.actionText, { color: themeColors.textPrimary }]}>
                              {t('common.cancel')}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionTextBtn, { backgroundColor: themeColors.primary }]}
                            onPress={() => saveEditedWeightEntry(entry.id)}
                            disabled={updateWeightEntry.isPending}
                          >
                            <Text style={[styles.actionText, { color: '#FFFFFF' }]}>
                              {isUpdatingCurrent ? '...' : t('common.save')}
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={t('common.edit')}
                            style={[
                              styles.iconBtn,
                              { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                            ]}
                            onPress={() => beginEditWeightEntry(entry)}
                            disabled={updateWeightEntry.isPending || deleteWeightEntry.isPending}
                          >
                            {(
                              metric === 'time'
                                ? entry.isEmptyDuration
                                : metric === 'reps'
                                  ? entry.isEmptyReps
                                  : entry.isEmptyWeight
                            ) ? (
                              <Plus size={16} color={themeColors.textPrimary} />
                            ) : (
                              <Pencil size={16} color={themeColors.textPrimary} />
                            )}
                          </TouchableOpacity>
                          {metric === 'weight' && !entry.isEmptyWeight && entry.weightKg > 0 ? (
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={t('training.exerciseCatalogRemoveWeightAction')}
                              style={[
                                styles.iconBtn,
                                { backgroundColor: isDark ? 'rgba(255,149,0,0.18)' : 'rgba(255,149,0,0.12)' },
                              ]}
                              onPress={() => confirmClearWeightEntry(entry)}
                              disabled={updateWeightEntry.isPending || deleteWeightEntry.isPending}
                            >
                              <X size={16} color={themeColors.warning} />
                            </TouchableOpacity>
                          ) : null}
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={t('training.deletePrValueTitle')}
                            style={[
                              styles.iconBtn,
                              {
                                backgroundColor: isDark ? 'rgba(255,59,48,0.2)' : 'rgba(255,59,48,0.12)',
                              },
                            ]}
                            onPress={() => confirmDeleteWeightEntry(entry.id)}
                            disabled={updateWeightEntry.isPending || deleteWeightEntry.isPending}
                          >
                            <Trash2 size={16} color={themeColors.danger} />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.s,
  },
  title: {
    ...typography.h3,
  },
  subtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: spacing.m,
    paddingBottom: 110,
    flexGrow: 1,
  },
  scroll: {
    flex: 1,
  },
  helperText: {
    ...typography.caption,
    marginBottom: spacing.s,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.l,
  },
  retryButton: {
    alignItems: 'center',
    borderRadius: borderRadius.m,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.s,
    minHeight: 44,
    paddingHorizontal: spacing.m,
  },
  retryButtonText: { fontSize: 13, fontWeight: '600' },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    paddingVertical: spacing.l,
  },
  valueRow: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: spacing.s,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.s,
  },
  valueDate: {
    ...typography.caption,
    marginBottom: 4,
  },
  valueMain: {
    ...typography.h4,
    fontWeight: '700',
  },
  editingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  valueInput: {
    minWidth: 96,
    height: 40,
    borderRadius: borderRadius.s,
    borderWidth: 1,
    paddingHorizontal: spacing.s,
    ...typography.body,
    fontWeight: '600',
  },
  valueInputUnit: {
    ...typography.caption,
    fontWeight: '600',
  },
  valueActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextBtn: {
    minWidth: 62,
    height: 34,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s,
  },
  actionText: {
    ...typography.caption,
    fontWeight: '700',
  },
});
