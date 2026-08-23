import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Alert } from '../../components/common/Alert';
import { borderRadius, spacing, typography } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { useSessionDetail } from '../../hooks/useSessionDetail';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { getCurrentAppLocale, getLocalizedExerciseName } from '../../services/localization';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { WorkoutSet } from '../../types/requests.types';
import { DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS } from '../../utils/numericInput';

interface DraftSet {
  key: string;
  reps: string;
  weight: string;
}

interface TemplateExerciseLite {
  exerciseId: string;
  name: string;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  orderIndex: number;
}

interface ExerciseSection {
  exerciseId: string;
  name: string;
  target: TemplateExerciseLite | null;
  existingSets: WorkoutSet[];
}

let draftKeyCounter = 0;
const nextDraftKey = () => `draft-${draftKeyCounter++}`;

/**
 * Post-hoc exercise completion for an already-finished (imported) strength
 * session. Deliberately has NO workout timers or rest countdowns: the user is
 * filling in what they already did. Exercises are merged by exercise id so
 * pre-existing sets are shown and extended instead of duplicated.
 */
export const CompleteExercisesScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'CompleteExercises'>>();
  const { sessionId } = route.params;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { preferences } = useUserPreferences();
  const locale = getCurrentAppLocale();

  const [drafts, setDrafts] = useState<Record<string, DraftSet[]>>({});
  const [extraExercises, setExtraExercises] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  const { data: sessionDetail } = useSessionDetail(sessionId);
  const exerciseGroups = useMemo(() => sessionDetail?.exerciseGroups ?? [], [sessionDetail]);

  const { data: sessionRow } = useQuery({
    queryKey: ['activitySession', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: templateExercises = [] } = useQuery({
    queryKey: ['completeExercisesTemplate', sessionRow?.workout_template_id, locale],
    queryFn: async (): Promise<TemplateExerciseLite[]> => {
      if (!sessionRow?.workout_template_id) return [];
      const { data, error } = await supabase
        .from('workout_template_exercises')
        .select('exercise_id, target_sets, target_reps_min, target_reps_max, order_index, exercise:exercises(*)')
        .eq('workout_template_id', sessionRow.workout_template_id)
        .order('order_index');
      if (error) throw error;
      return (data ?? []).map(row => ({
        exerciseId: row.exercise_id,
        name: row.exercise ? getLocalizedExerciseName(row.exercise) : '',
        targetSets: row.target_sets,
        targetRepsMin: row.target_reps_min,
        targetRepsMax: row.target_reps_max,
        orderIndex: row.order_index,
      }));
    },
    enabled: !!sessionRow?.workout_template_id,
  });

  // Merge template exercises, already-logged exercises and manually added
  // ones into a single deduplicated list (one section per exercise id).
  const sections = useMemo<ExerciseSection[]>(() => {
    const byId = new Map<string, ExerciseSection>();
    for (const templateExercise of templateExercises) {
      if (!byId.has(templateExercise.exerciseId)) {
        byId.set(templateExercise.exerciseId, {
          exerciseId: templateExercise.exerciseId,
          name: templateExercise.name,
          target: templateExercise,
          existingSets: [],
        });
      }
    }
    for (const group of exerciseGroups) {
      const section = byId.get(group.exercise_id);
      if (section) {
        section.existingSets = group.sets;
      } else {
        byId.set(group.exercise_id, {
          exerciseId: group.exercise_id,
          name: group.exercise_name,
          target: null,
          existingSets: group.sets,
        });
      }
    }
    for (const extra of extraExercises) {
      if (!byId.has(extra.id)) {
        byId.set(extra.id, { exerciseId: extra.id, name: extra.name, target: null, existingSets: [] });
      }
    }
    return Array.from(byId.values());
  }, [templateExercises, exerciseGroups, extraExercises]);

  const hasExistingSets = exerciseGroups.length > 0;
  const totalDraftCount = Object.values(drafts).reduce(
    (sum, draftList) => sum + draftList.filter(draft => draft.reps.trim() !== '').length,
    0,
  );

  const addDraft = (exerciseId: string) => {
    setDrafts(current => ({
      ...current,
      [exerciseId]: [...(current[exerciseId] ?? []), { key: nextDraftKey(), reps: '', weight: '' }],
    }));
  };

  const updateDraft = (exerciseId: string, key: string, field: 'reps' | 'weight', value: string) => {
    setDrafts(current => ({
      ...current,
      [exerciseId]: (current[exerciseId] ?? []).map(draft =>
        draft.key === key ? { ...draft, [field]: value } : draft,
      ),
    }));
  };

  const removeDraft = (exerciseId: string, key: string) => {
    setDrafts(current => ({
      ...current,
      [exerciseId]: (current[exerciseId] ?? []).filter(draft => draft.key !== key),
    }));
  };

  const handleAddExercise = () => {
    navigation.navigate('ExerciseSearch', {
      onSelect: () => undefined,
      onExerciseSelected: exercise => {
        // Anti-duplicate guard: reuse the existing section instead of adding
        // the same exercise twice. ExerciseSearch pops itself after selecting.
        const alreadyPresent = sections.some(section => section.exerciseId === exercise.id);
        if (!alreadyPresent) {
          setExtraExercises(current =>
            current.some(extra => extra.id === exercise.id)
              ? current
              : [...current, { id: exercise.id, name: exercise.name }],
          );
        }
        addDraft(exercise.id);
      },
      fromScreen: 'CompleteExercises',
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const rows: Array<{
        session_id: string;
        exercise_id: string;
        set_number: number;
        reps: number;
        weight_kg: number;
        user_id: string;
        created_at: string;
      }> = [];
      for (const section of sections) {
        const sectionDrafts = (drafts[section.exerciseId] ?? []).filter(draft => draft.reps.trim() !== '');
        // Continue numbering after the sets that already exist for this
        // exercise so nothing gets duplicated or renumbered.
        let setNumber = section.existingSets.reduce((max, set) => Math.max(max, set.set_number ?? 0), 0);
        for (const draft of sectionDrafts) {
          const reps = parseInt(draft.reps, 10);
          if (Number.isNaN(reps) || reps <= 0) continue;
          const displayWeight = parseFloat(draft.weight);
          const weightValue = Number.isNaN(displayWeight) ? 0 : displayWeight;
          const weightKg = preferences.weight_unit === 'lb' ? weightValue / 2.20462 : weightValue;
          setNumber += 1;
          rows.push({
            session_id: sessionId,
            exercise_id: section.exerciseId,
            set_number: setNumber,
            reps,
            weight_kg: weightKg,
            user_id: user.id,
            created_at: new Date().toISOString(),
          });
        }
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('workout_sets').insert(rows);
        if (error) throw error;

        // Recompute session totals from all persisted sets.
        const { data: allSets, error: totalsError } = await supabase
          .from('workout_sets')
          .select('reps, weight_kg')
          .eq('session_id', sessionId);
        if (totalsError) throw totalsError;
        const totals = (allSets ?? []).reduce(
          (acc, set) => ({
            sets: acc.sets + 1,
            reps: acc.reps + (set.reps ?? 0),
            volume: acc.volume + (set.reps ?? 0) * (set.weight_kg ?? 0),
          }),
          { sets: 0, reps: 0, volume: 0 },
        );
        const { error: sessionError } = await supabase
          .from('activity_sessions')
          .update({
            total_sets: totals.sets,
            total_reps: totals.reps,
            total_volume_kg: Math.round(totals.volume * 100) / 100,
          })
          .eq('id', sessionId);
        if (sessionError) throw sessionError;
      }

      queryClient.invalidateQueries({ queryKey: ['sessionDetail'] });
      queryClient.invalidateQueries({ queryKey: ['activitySession', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      Alert.alert(t('training.completeExercisesTitle'), t('training.completeExercisesSaved'));
      navigation.goBack();
    } catch {
      Alert.alert(t('common.error'), t('training.importReviewActionError'));
    } finally {
      setSaving(false);
    }
  };

  const formatTarget = (target: TemplateExerciseLite): string => {
    const reps =
      target.targetRepsMin != null && target.targetRepsMax != null && target.targetRepsMin !== target.targetRepsMax
        ? `${target.targetRepsMin}-${target.targetRepsMax}`
        : `${target.targetRepsMax ?? target.targetRepsMin ?? ''}`;
    return `${target.targetSets ?? '-'} x ${reps || '-'}`;
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, dynamicStyles.container]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={[typography.body, { color: themeColors.primary }]}>{t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={[typography.h3, dynamicStyles.headerTitle]}>{t('training.completeExercisesTitle')}</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {hasExistingSets && (
            <Text style={[typography.caption, { color: themeColors.textSecondary, marginBottom: spacing.m }]}>
              {t('training.completeExercisesExistingHint')}
            </Text>
          )}

          {sections.length === 0 && (
            <Text style={[typography.body, { color: themeColors.textSecondary, marginBottom: spacing.m }]}>
              {t('training.completeExercisesEmpty')}
            </Text>
          )}

          {sections.map(section => (
            <GlassCard key={section.exerciseId} style={[styles.exerciseCard, dynamicStyles.glassCard]}>
              <View style={styles.exerciseHeader}>
                <Text style={[typography.body, styles.exerciseName, { color: themeColors.textPrimary }]}>
                  {section.name}
                </Text>
                {section.target && (
                  <Text style={[typography.caption, { color: themeColors.textSecondary }]}>
                    {formatTarget(section.target)}
                  </Text>
                )}
              </View>

              {section.existingSets.map(set => (
                <View key={set.id} style={[styles.setRow, { borderBottomColor: themeColors.border }]}>
                  <Text style={[typography.caption, { color: themeColors.textSecondary, width: 40 }]}>
                    {set.set_number}
                  </Text>
                  <Text style={[typography.body, { color: themeColors.textPrimary }]}>
                    {set.reps} x{' '}
                    {preferences.weight_unit === 'lb'
                      ? `${Math.round((set.weight_kg ?? 0) * 2.20462 * 10) / 10} lb`
                      : `${set.weight_kg ?? 0} kg`}
                  </Text>
                </View>
              ))}

              {(drafts[section.exerciseId] ?? []).map((draft, index) => (
                <View key={draft.key} style={[styles.setRow, { borderBottomColor: themeColors.border }]}>
                  <Text style={[typography.caption, { color: themeColors.textSecondary, width: 40 }]}>
                    {section.existingSets.length + index + 1}
                  </Text>
                  <TextInput
                    style={[styles.setInput, { color: themeColors.textPrimary, borderColor: themeColors.border }]}
                    {...INTEGER_INPUT_PROPS}
                    placeholder={t('training.repsColon')}
                    placeholderTextColor={themeColors.textSecondary}
                    value={draft.reps}
                    onChangeText={value => updateDraft(section.exerciseId, draft.key, 'reps', value)}
                  />
                  <TextInput
                    style={[styles.setInput, { color: themeColors.textPrimary, borderColor: themeColors.border }]}
                    {...DECIMAL_INPUT_PROPS}
                    placeholder={preferences.weight_unit}
                    placeholderTextColor={themeColors.textSecondary}
                    value={draft.weight}
                    onChangeText={value => updateDraft(section.exerciseId, draft.key, 'weight', value)}
                  />
                  <TouchableOpacity onPress={() => removeDraft(section.exerciseId, draft.key)} hitSlop={8}>
                    <X size={18} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.addSetButton} onPress={() => addDraft(section.exerciseId)}>
                <Plus size={16} color={themeColors.primary} />
                <Text style={[typography.body, { color: themeColors.primary, fontWeight: '600' }]}>
                  {t('training.completeExercisesAddSet')}
                </Text>
              </TouchableOpacity>
            </GlassCard>
          ))}

          <PrimaryButton
            title={t('training.completeExercisesAddExercise')}
            onPress={handleAddExercise}
            variant="secondary"
            style={{ marginBottom: spacing.m }}
          />
          {saving ? (
            <ActivityIndicator color={themeColors.primary} />
          ) : (
            <PrimaryButton
              title={t('training.completeExercisesSave')}
              onPress={handleSave}
              disabled={totalDraftCount === 0}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  backButton: {
    minWidth: 60,
  },
  content: {
    padding: spacing.m,
    paddingBottom: 120,
  },
  exerciseCard: {
    marginBottom: spacing.m,
    padding: spacing.m,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  exerciseName: {
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.s,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  setInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.s,
    paddingHorizontal: spacing.s,
    paddingVertical: 6,
    fontSize: 16,
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.s,
  },
});

export default CompleteExercisesScreen;
