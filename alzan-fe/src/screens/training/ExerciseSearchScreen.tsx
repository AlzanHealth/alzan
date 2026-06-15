import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useExercises } from '../../hooks/useExercises';
import { useMuscleGroups } from '../../hooks/useMuscleGroups';
import { useEquipment } from '../../hooks/useEquipment';
import { Search, ArrowLeft, Dumbbell, Info, Check } from 'lucide-react-native';
import { ExerciseWithDetails } from '../../types/training';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useTranslation } from 'react-i18next';

export type MuscleGroupOrEquipment = {
  id: number;
  name: string;
  code: string;
};

const EXERCISE_PAGE_SIZE = 15;

export const ExerciseSearchScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'ExerciseSearch'>>();
  const isMultiSelect = route.params?.selectionMode === 'multi';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleId, setSelectedMuscleId] = useState<number | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(EXERCISE_PAGE_SIZE);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  // Multi-select staging (used when launched from the routine editor).
  const [selectedExercises, setSelectedExercises] = useState<ExerciseWithDetails[]>([]);

  const { exercises, isLoading, isFetching, hasMore } = useExercises({
    searchQuery: debouncedSearchQuery,
    selectedMuscleId,
    selectedEquipmentId,
    limit: visibleLimit,
  });
  const { muscleGroups } = useMuscleGroups();
  const { equipment } = useEquipment();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setVisibleLimit(EXERCISE_PAGE_SIZE);
  }, [debouncedSearchQuery, selectedMuscleId, selectedEquipmentId]);
  const showInitialLoading = isLoading && exercises.length === 0;

  const handleSelectExercise = (exercise: ExerciseWithDetails) => {
    const { fromScreen, onExerciseSelected } = route.params || {};

    if (fromScreen === 'GymRoutineEditor') {
      // Use Event Emitter to pass data back safely without navigation stack issues
      DeviceEventEmitter.emit('exerciseSelected', exercise);
      navigation.goBack();
    } else if (onExerciseSelected && typeof onExerciseSelected === 'function') {
      // Callback mode for ActiveWorkoutScreen ad-hoc exercises
      onExerciseSelected(exercise);
      navigation.goBack();
    } else {
      navigation.goBack();
    }
  };

  const isExerciseSelected = (exerciseId: string) => selectedExercises.some(item => item.id === exerciseId);

  const toggleExerciseSelection = (exercise: ExerciseWithDetails) => {
    setSelectedExercises(prev =>
      prev.some(item => item.id === exercise.id) ? prev.filter(item => item.id !== exercise.id) : [...prev, exercise],
    );
  };

  // Multi-select: emit every staged exercise (the editor listener appends each
  // one in order) and return once.
  const handleConfirmMultiSelect = () => {
    if (selectedExercises.length === 0) return;
    selectedExercises.forEach(exercise => DeviceEventEmitter.emit('exerciseSelected', exercise));
    navigation.goBack();
  };

  const handlePressExercise = (exercise: ExerciseWithDetails) => {
    if (isMultiSelect) {
      toggleExerciseSelection(exercise);
      return;
    }
    handleSelectExercise(exercise);
  };

  const handleShowInfo = (exercise: ExerciseWithDetails) => {
    navigation.navigate('ExerciseDetail', { exercise });
  };

  const renderItem = ({ item }: { item: ExerciseWithDetails }) => {
    const selected = isMultiSelect && isExerciseSelected(item.id);

    return (
      <View
        style={[
          styles.card,
          dynamicStyles.glassCard,
          selected && {
            borderColor: themeColors.primary,
            borderWidth: 1.5,
            backgroundColor: `${themeColors.primary}0D`,
          },
        ]}
      >
        <TouchableOpacity onPress={() => handlePressExercise(item)} style={styles.cardContent}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : `${themeColors.primary}10` },
            ]}
          >
            <Dumbbell size={24} color={themeColors.primary} />
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.exerciseName, dynamicStyles.title]}>{item.name}</Text>
            <View style={styles.metaRow}>
              {item.muscle_name && <Text style={styles.muscleText}>{item.muscle_name}</Text>}
              {item.muscle_name && item.equipment_name && <Text style={styles.separatorText}>•</Text>}
              {item.equipment_name && <Text style={styles.equipmentText}>{item.equipment_name}</Text>}
            </View>
          </View>
          {isMultiSelect && (
            <View
              style={[
                styles.checkbox,
                selected
                  ? { backgroundColor: themeColors.primary, borderColor: themeColors.primary }
                  : { borderColor: themeColors.textSecondary },
              ]}
            >
              {selected && <Check size={15} color="#FFFFFF" strokeWidth={3} />}
            </View>
          )}
          <TouchableOpacity
            onPress={() => handleShowInfo(item)}
            style={styles.infoButton}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Info size={20} color={themeColors.primary} />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  };

  // Inline, horizontally-scrollable filter chips (faster than the old modals).
  const renderFilterChips = (
    allLabel: string,
    items: MuscleGroupOrEquipment[],
    selectedId: number | null,
    onSelect: (id: number | null) => void,
  ) => {
    const renderChip = (key: string, label: string, active: boolean, onPress: () => void) => (
      <TouchableOpacity
        key={key}
        style={[
          styles.filterChip,
          {
            backgroundColor: active ? themeColors.primary : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            borderColor: active ? themeColors.primary : 'transparent',
          },
        ]}
        onPress={onPress}
      >
        <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : themeColors.textSecondary }]}>{label}</Text>
      </TouchableOpacity>
    );

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipsRow}
        keyboardShouldPersistTaps="handled"
      >
        {renderChip('all', allLabel, selectedId === null, () => onSelect(null))}
        {items.map(item =>
          renderChip(String(item.id), item.name, selectedId === item.id, () =>
            onSelect(selectedId === item.id ? null : item.id),
          ),
        )}
      </ScrollView>
    );
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.title]} numberOfLines={1}>
            {isMultiSelect ? t('training.selectExercises') : t('training.selectExercise')}
          </Text>
          {isMultiSelect && (
            <TouchableOpacity
              onPress={handleConfirmMultiSelect}
              disabled={selectedExercises.length === 0}
              style={styles.headerConfirmButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text
                style={[
                  styles.headerConfirmText,
                  { color: selectedExercises.length === 0 ? themeColors.textSecondary : themeColors.primary },
                ]}
              >
                {t('training.addCountExercises', { count: selectedExercises.length })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {/* ... rest of render ... */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchBar, dynamicStyles.input, { height: 50, paddingVertical: 0 }]}>
            <Search size={20} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.textPrimary }]}
              placeholder={t('nutrition.search')}
              placeholderTextColor={themeColors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus={false}
            />
          </View>
        </View>

        <View style={styles.filtersBlock}>
          {renderFilterChips(t('training.allEquipment'), equipment, selectedEquipmentId, setSelectedEquipmentId)}
          {renderFilterChips(t('training.allMuscles'), muscleGroups, selectedMuscleId, setSelectedMuscleId)}
        </View>

        {showInitialLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={exercises}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            extraData={selectedExercises}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              hasMore ? (
                <TouchableOpacity
                  style={[styles.loadMoreButton, dynamicStyles.secondaryButton]}
                  onPress={() => setVisibleLimit(previous => previous + EXERCISE_PAGE_SIZE)}
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <ActivityIndicator size="small" color={themeColors.primary} />
                  ) : (
                    <Text style={[styles.loadMoreText, { color: themeColors.primary }]}>{t('common.loadMore')}</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  {t('training.noExercisesFound')}
                </Text>
              </View>
            }
          />
        )}
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
    padding: spacing.m,
    paddingBottom: spacing.s,
  },
  backButton: {
    marginRight: spacing.m,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  headerConfirmButton: {
    paddingLeft: spacing.s,
  },
  headerConfirmText: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 16,
  },
  searchContainer: {
    paddingHorizontal: spacing.m,
    marginBottom: spacing.s,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.m,
    height: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: spacing.s,
    color: colors.textPrimary,
    fontSize: 16,
  },
  filtersBlock: {
    paddingBottom: spacing.s,
    gap: spacing.xs,
  },
  filterChipsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    gap: spacing.s,
  },
  filterChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterChipText: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.m,
    paddingTop: 0,
    paddingBottom: 100,
  },
  card: {
    marginBottom: spacing.m,
    padding: spacing.m,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.l,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#FAFAFA',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.m,
  },
  textContainer: {
    flex: 1,
  },
  exerciseName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  muscleText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  separatorText: {
    color: colors.textSecondary,
  },
  equipmentText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  infoButton: {
    padding: spacing.s,
    marginLeft: spacing.s,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  loadMoreButton: {
    marginTop: spacing.s,
    marginBottom: spacing.l,
    marginHorizontal: spacing.m,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.m,
  },
  loadMoreText: {
    ...typography.body,
    fontWeight: '600',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.s,
  },
});
