import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import { borderRadius, spacing, typography } from '../../../theme';
import type { WorkoutTemplateExerciseWithDetails } from '../ActiveWorkoutScreen';
import type { ActiveWorkoutDraft } from '../helpers/activeWorkoutDraft';
import { workoutSetProgress } from '../helpers/workoutSetProgress';
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
  const listRef = useRef<FlatList<string[]>>(null);
  const organizerOffset = useRef(0);
  const blocks = useMemo(() => workoutBlocks(draft), [draft]);
  const exerciseById = useMemo(
    () => new Map([...exercises, ...draft.adhocExercises].map(exercise => [exercise.exercise_id, exercise])),
    [exercises, draft.adhocExercises],
  );
  const completedSets = useMemo(() => new Set(draft.completedSets), [draft.completedSets]);
  const exerciseName = useCallback(
    (id: string) => {
      const details = exerciseById.get(id)?.exercise;
      return (
        (i18n.language.startsWith('en')
          ? details?.base_name_en || details?.base_name_es
          : details?.base_name_es || details?.base_name_en) || t('training.exercise')
      );
    },
    [exerciseById, i18n.language, t],
  );

  useEffect(() => {
    if (!visible) setMovingId(null);
  }, [visible]);

  const closeSelector = useCallback(() => {
    setMovingId(null);
  }, []);

  const movingIndex = blocks.findIndex(ids => ids[0] === movingId);

  const renderDestination = useCallback(
    ({ item: ids, index }: { item: string[]; index: number }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: index === movingIndex, selected: index === movingIndex }}
        accessibilityLabel={`${index + 1} · ${ids.map(exerciseName).join(' · ')}`}
        disabled={index === movingIndex}
        style={({ pressed }) => [
          styles.destination,
          theme.border,
          index === movingIndex && styles.disabled,
          pressed && styles.pressed,
        ]}
        onPress={() => {
          if (movingIndex < 0) return;
          onChange(moveWorkoutBlock(draft, movingIndex, index));
          closeSelector();
        }}
      >
        <Text style={[styles.position, theme.subtitle]}>{index + 1}</Text>
        <View style={styles.destinationLabel}>
          {ids.length > 1 && <Text style={[styles.caption, theme.subtitle]}>{t('training.organizationSuperset')}</Text>}
          {ids.map(id => (
            <Text key={id} style={[styles.name, theme.title]}>
              {exerciseName(id)}
            </Text>
          ))}
        </View>
      </Pressable>
    ),
    [movingIndex, exerciseName, theme, draft, onChange, closeSelector, t],
  );

  const renderBlock = useCallback(
    ({ item: ids, index }: { item: string[]; index: number }) => (
      <View style={[styles.block, theme.border]}>
        <View style={styles.blockHeading}>
          <Text accessibilityRole="header" style={[styles.blockTitle, theme.title]}>
            {ids.length > 1
              ? `${index + 1} · ${t('training.organizationSuperset')}`
              : `${index + 1} · ${exerciseName(ids[0])}`}
          </Text>
          {blocks.length > 1 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('training.moveWorkoutTo')}: ${ids.map(exerciseName).join(' · ')}`}
              style={({ pressed }) => [styles.button, theme.secondaryButton, pressed && styles.pressed]}
              onPress={() => setMovingId(ids[0])}
            >
              <Text style={[styles.buttonText, theme.title]}>{t('training.moveWorkoutTo')}</Text>
            </Pressable>
          )}
        </View>
        {ids.map(id => {
          const exercise = exerciseById.get(id);
          const name = exerciseName(id);
          const { completed, total } = workoutSetProgress(
            id,
            exercise?.target_sets,
            draft.extraSets[id] ?? 0,
            completedSets,
          );
          const reason = substitutionBlockReason(draft, id, savedExerciseIds, executingId);
          return (
            <View key={id} style={styles.member}>
              {ids.length > 1 && <Text style={[styles.name, theme.title]}>{name}</Text>}
              <Text style={[styles.caption, theme.subtitle]}>
                {t('training.setProgressCompact', { completed, total })}
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
      </View>
    ),
    [
      blocks,
      completedSets,
      draft,
      executingId,
      exerciseById,
      exerciseName,
      onChange,
      onReplace,
      savedExerciseIds,
      t,
      theme,
    ],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={movingId ? closeSelector : onCancel}>
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
            {movingId && (
              <Pressable
                accessibilityRole="button"
                onPress={closeSelector}
                style={[styles.button, styles.backButton, theme.secondaryButton]}
              >
                <Text style={[styles.buttonText, theme.title]}>{t('common.back')}</Text>
              </Pressable>
            )}
            <Text accessibilityRole="header" style={[styles.title, theme.title]}>
              {t(movingId ? 'training.moveWorkoutTo' : 'training.organizeWorkout')}
            </Text>
            <Text style={[styles.caption, theme.subtitle]} numberOfLines={movingId ? 2 : undefined}>
              {movingId ? (blocks[movingIndex] ?? []).map(exerciseName).join(' · ') : t('training.organizationHint')}
            </Text>
          </View>
          <FlatList
            key={movingId ? 'destinations' : 'organizer'}
            ref={listRef}
            data={blocks}
            renderItem={movingId ? renderDestination : renderBlock}
            keyExtractor={ids => ids.join('|')}
            style={styles.list}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            extraData={movingId ? renderDestination : renderBlock}
            onScroll={event => {
              if (!movingId) organizerOffset.current = event.nativeEvent.contentOffset.y;
            }}
            onContentSizeChange={() => {
              if (!movingId) listRef.current?.scrollToOffset({ offset: organizerOffset.current, animated: false });
            }}
            scrollEventThrottle={16}
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
  header: { padding: spacing.m, gap: spacing.s, flexShrink: 0 },
  title: { ...typography.h3 },
  caption: { ...typography.caption },
  list: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: spacing.m, paddingBottom: spacing.m, gap: spacing.m },
  block: { borderWidth: 1, borderRadius: borderRadius.m, padding: spacing.s, gap: spacing.s },
  blockHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  blockTitle: { ...typography.button, flex: 1 },
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
  buttonText: { ...typography.button, fontSize: 13, textAlign: 'center' },
  destination: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.s,
    borderWidth: 1,
    borderRadius: borderRadius.s,
  },
  position: { ...typography.button, minWidth: 24, textAlign: 'center' },
  destinationLabel: { flex: 1, gap: spacing.xs },
  backButton: { alignSelf: 'flex-start' },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.m,
    gap: spacing.s,
    borderTopWidth: 1,
    flexShrink: 0,
  },
  footerButton: { flexGrow: 1, flexBasis: 100 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});

export default WorkoutOrganizer;
