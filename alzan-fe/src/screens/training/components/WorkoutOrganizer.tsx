import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import { borderRadius, spacing, typography } from '../../../theme';
import type { WorkoutTemplateExerciseWithDetails } from '../ActiveWorkoutScreen';
import type { ActiveWorkoutDraft } from '../helpers/activeWorkoutDraft';
import {
  detachWorkoutExercise,
  moveWorkoutBlock,
  substitutionBlockReason,
  workoutBlocks,
} from '../helpers/workoutOrganization';

export interface WorkoutOrganizerProps {
  visible: boolean;
  draft: ActiveWorkoutDraft;
  exercises: WorkoutTemplateExerciseWithDetails[];
  savedExerciseIds: string[];
  executingId: string | null;
  onChange: (draft: ActiveWorkoutDraft) => void;
  onCancel: () => void;
  onApply: () => void;
  onReplace: (id: string) => void;
}

export function WorkoutOrganizer({
  visible,
  draft,
  exercises,
  savedExerciseIds,
  executingId,
  onChange,
  onCancel,
  onApply,
  onReplace,
}: WorkoutOrganizerProps) {
  const { t, i18n } = useTranslation();
  const { styles: theme } = useTrainingStyles();
  const insets = useSafeAreaInsets();
  const [movingId, setMovingId] = useState<string | null>(null);
  const blocks = useMemo(() => workoutBlocks(draft), [draft]);
  const exerciseById = useMemo(
    () => new Map([...exercises, ...draft.adhocExercises].map(exercise => [exercise.exercise_id, exercise])),
    [exercises, draft.adhocExercises],
  );
  const completedSets = useMemo(() => new Set(draft.completedSets), [draft.completedSets]);

  useEffect(() => {
    if (!visible) setMovingId(null);
  }, [visible]);

  const renderBlock = useCallback(
    ({ item: ids, index }: { item: string[]; index: number }) => (
      <View style={[styles.block, theme.border]}>
        <Text accessibilityRole="header" style={[styles.blockTitle, theme.title]}>
          {t('training.workoutBlock', { position: index + 1 })}
        </Text>
        {ids.map(id => {
          const exercise = exerciseById.get(id);
          const details = exercise?.exercise;
          const name =
            (i18n.language.startsWith('en')
              ? details?.base_name_en || details?.base_name_es
              : details?.base_name_es || details?.base_name_en) || t('training.exercise');
          const total = Math.max(0, (exercise?.target_sets ?? 3) + (draft.extraSets[id] ?? 0));
          const completed = Array.from({ length: total }, (_, number) => `${id}-${number + 1}`).filter(key =>
            completedSets.has(key),
          ).length;
          const reason = substitutionBlockReason(draft, id, savedExerciseIds, executingId);
          return (
            <View key={id} style={styles.member}>
              <Text style={[styles.name, theme.title]}>{name}</Text>
              <Text style={[styles.caption, theme.subtitle]}>
                {t('training.organizationProgress', { completed, total })}
              </Text>
              <View style={styles.actions}>
                {ids.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('training.detachSuperset')}: ${name}`}
                    style={({ pressed }) => [styles.button, theme.secondaryButton, pressed && styles.pressed]}
                    onPress={() => {
                      setMovingId(null);
                      onChange(detachWorkoutExercise(draft, id));
                    }}
                  >
                    <Text style={[styles.buttonText, theme.title]}>{t('training.detachSuperset')}</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('training.replaceExercise')}: ${name}`}
                  accessibilityState={{ disabled: !!reason }}
                  accessibilityHint={reason ? t(`training.${reason}`) : undefined}
                  disabled={!!reason}
                  style={({ pressed }) => [
                    styles.button,
                    theme.secondaryButton,
                    !!reason && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    if (!reason) onReplace(id);
                  }}
                >
                  <Text style={[styles.buttonText, theme.title]}>{t('training.replaceExercise')}</Text>
                </Pressable>
              </View>
              {reason && <Text style={[styles.caption, theme.subtitle]}>{t(`training.${reason}`)}</Text>}
            </View>
          );
        })}
        {blocks.length > 1 && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: movingId === ids[0] }}
            accessibilityLabel={`${t('training.moveWorkoutTo')}: ${t('training.workoutBlock', { position: index + 1 })}`}
            style={({ pressed }) => [styles.button, theme.secondaryButton, pressed && styles.pressed]}
            onPress={() => setMovingId(current => (current === ids[0] ? null : ids[0]))}
          >
            <Text style={[styles.buttonText, theme.title]}>{t('training.moveWorkoutTo')}</Text>
          </Pressable>
        )}
        {movingId === ids[0] && (
          <View style={[styles.destinations, theme.border]}>
            {blocks.map((block, destination) => (
              <Pressable
                key={block[0]}
                accessibilityRole="button"
                accessibilityState={{ disabled: destination === index, selected: destination === index }}
                disabled={destination === index}
                style={({ pressed }) => [
                  styles.button,
                  theme.secondaryButton,
                  destination === index && styles.disabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setMovingId(null);
                  onChange(moveWorkoutBlock(draft, index, destination));
                }}
              >
                <Text style={[styles.buttonText, theme.title]}>
                  {t('training.workoutBlock', { position: destination + 1 })}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    ),
    [
      blocks,
      completedSets,
      draft,
      executingId,
      exerciseById,
      i18n.language,
      movingId,
      onChange,
      onReplace,
      savedExerciseIds,
      t,
      theme,
    ],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={[
          styles.overlay,
          theme.modalOverlay,
          {
            paddingTop: insets.top + spacing.m,
            paddingBottom: insets.bottom + spacing.m,
            paddingLeft: insets.left + spacing.m,
            paddingRight: insets.right + spacing.m,
          },
        ]}
      >
        <View accessibilityViewIsModal style={[styles.panel, theme.modalContent]}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, theme.title]}>
              {t('training.organizeWorkout')}
            </Text>
            <Text style={[styles.caption, theme.subtitle]}>{t('training.organizationHint')}</Text>
          </View>
          <FlatList
            data={blocks}
            renderItem={renderBlock}
            keyExtractor={ids => ids.join('|')}
            style={styles.list}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            extraData={renderBlock}
          />
          <View style={[styles.footer, theme.border]}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                styles.footerButton,
                theme.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.buttonText, theme.title]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onApply}
              style={({ pressed }) => [
                styles.button,
                styles.footerButton,
                theme.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.buttonText, theme.selectedDayText]}>{t('training.apply')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  panel: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '100%',
    flexShrink: 1,
    borderRadius: borderRadius.l,
    overflow: 'hidden',
  },
  header: { padding: spacing.m, gap: spacing.s },
  title: { ...typography.h3 },
  caption: { ...typography.caption },
  list: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: spacing.m, paddingBottom: spacing.m, gap: spacing.m },
  block: { borderWidth: 1, borderRadius: borderRadius.m, padding: spacing.s, gap: spacing.s },
  blockTitle: { ...typography.button },
  member: { gap: spacing.xs, paddingVertical: spacing.xs },
  name: { ...typography.body },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  button: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.s,
    flexShrink: 1,
  },
  buttonText: { ...typography.button, textAlign: 'center' },
  destinations: { borderLeftWidth: 1, marginLeft: spacing.s, paddingLeft: spacing.s, gap: spacing.s },
  footer: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.m, gap: spacing.s, borderTopWidth: 1 },
  footerButton: { flexGrow: 1, flexBasis: 100 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});

export default WorkoutOrganizer;
