import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Modal,
  Pressable,
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
import { Search, ArrowLeft, Dumbbell, Info, ChevronDown, Check } from 'lucide-react-native';
import { ExerciseWithDetails } from '../../types/training';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useTranslation } from 'react-i18next';
import { matchesLoosely } from '../../services/localization';

export type MuscleGroupOrEquipment = {
  id: number;
  name: string;
  code: string;
};

export const ExerciseSearchScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'ExerciseSearch'>>();
  const { exercises, isLoading } = useExercises();
  const { muscleGroups } = useMuscleGroups();
  const { equipment } = useEquipment();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleId, setSelectedMuscleId] = useState<number | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);

  // Modal states
  const [showMuscleModal, setShowMuscleModal] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);

  // Get selected names for display
  const selectedMuscleName = selectedMuscleId
    ? muscleGroups.find(m => m.id === selectedMuscleId)?.name
    : t('training.allMuscles');
  const selectedEquipmentName = selectedEquipmentId
    ? equipment.find(e => e.id === selectedEquipmentId)?.name
    : t('training.allEquipment');

  const filteredExercises = useMemo(() => {
    let filtered = exercises;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(ex => {
        return matchesLoosely(
          searchQuery,
          ex.name,
          ex.base_name_es,
          ex.base_name_en,
          ex.description,
          ex.description_es,
          ex.description_en,
          ex.muscle_name,
          ex.secondary_muscle_name,
          ex.equipment_name,
        );
      });
    }

    // Filter by muscle group
    if (selectedMuscleId !== null) {
      filtered = filtered.filter(ex => ex.primary_muscle?.id === selectedMuscleId);
    }

    // Filter by equipment
    if (selectedEquipmentId !== null) {
      filtered = filtered.filter(ex => ex.equipment?.id === selectedEquipmentId);
    }

    return filtered;
  }, [exercises, searchQuery, selectedMuscleId, selectedEquipmentId]);

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

  const handleShowInfo = (exercise: ExerciseWithDetails) => {
    navigation.navigate('ExerciseDetail', { exercise });
  };

  const renderItem = ({ item }: { item: ExerciseWithDetails }) => (
    <View style={[styles.card, dynamicStyles.glassCard]}>
      <TouchableOpacity onPress={() => handleSelectExercise(item)} style={styles.cardContent}>
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

  // Render Compact Centered Modal (Less Invasive)
  const renderFilterModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    itemType: 'muscle' | 'equipment',
    items: MuscleGroupOrEquipment[],
    selectedId: number | null,
    onSelect: (id: number | null) => void,
  ) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContent, dynamicStyles.modalContent]}>
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: isDark ? themeColors.surfaceSolid : '#FFFFFF',
                borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : '#F5F5F5',
              },
            ]}
          >
            <Text style={[styles.modalTitle, dynamicStyles.title]}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F5F5F5' }]}
            >
              <Text style={[styles.closeButtonText, { color: themeColors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={[
                styles.modalOption,
                selectedId === null && { backgroundColor: `${themeColors.primary}08` },
                { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#FAFAFA' },
              ]}
              onPress={() => onSelect(null)}
            >
              <Text
                style={[
                  styles.modalOptionText,
                  selectedId === null && styles.modalOptionTextSelected,
                  { color: selectedId === null ? themeColors.primary : themeColors.textPrimary },
                ]}
              >
                {itemType === 'muscle' ? t('training.allMuscles') : t('training.allEquipment')}
              </Text>
              {selectedId === null && <Check size={18} color={themeColors.primary} />}
            </TouchableOpacity>

            {items.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.modalOption,
                  selectedId === item.id && { backgroundColor: `${themeColors.primary}08` },
                  { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#FAFAFA' },
                ]}
                onPress={() => onSelect(item.id)}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    selectedId === item.id && styles.modalOptionTextSelected,
                    {
                      color: selectedId === item.id ? themeColors.primary : themeColors.textPrimary,
                    },
                  ]}
                >
                  {item.name}
                </Text>
                {selectedId === item.id && <Check size={18} color={themeColors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.title]}>{t('training.selectExercise')}</Text>
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

        <View style={styles.filtersRow}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              dynamicStyles.glassCard,
              selectedEquipmentId !== null && {
                backgroundColor: themeColors.primary,
                borderColor: themeColors.primary,
              },
            ]}
            onPress={() => setShowEquipmentModal(true)}
          >
            <Text
              style={[
                styles.filterButtonText,
                { color: selectedEquipmentId !== null ? '#FFFFFF' : themeColors.textSecondary },
                selectedEquipmentId !== null && styles.filterButtonTextActive,
              ]}
            >
              {selectedEquipmentName}
            </Text>
            <ChevronDown size={16} color={selectedEquipmentId !== null ? '#FFFFFF' : themeColors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              dynamicStyles.glassCard,
              selectedMuscleId !== null && {
                backgroundColor: themeColors.primary,
                borderColor: themeColors.primary,
              },
            ]}
            onPress={() => setShowMuscleModal(true)}
          >
            <Text
              style={[
                styles.filterButtonText,
                { color: selectedMuscleId !== null ? '#FFFFFF' : themeColors.textSecondary },
                selectedMuscleId !== null && styles.filterButtonTextActive,
              ]}
            >
              {selectedMuscleName}
            </Text>
            <ChevronDown size={16} color={selectedMuscleId !== null ? '#FFFFFF' : themeColors.textSecondary} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredExercises}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  {t('training.noExercisesFound')}
                </Text>
              </View>
            }
          />
        )}

        {renderFilterModal(
          showEquipmentModal,
          () => setShowEquipmentModal(false),
          t('training.equipment'),
          'equipment',
          equipment,
          selectedEquipmentId,
          id => {
            setSelectedEquipmentId(id);
            setShowEquipmentModal(false);
          },
        )}
        {renderFilterModal(
          showMuscleModal,
          () => setShowMuscleModal(false),
          t('training.muscleGroup'),
          'muscle',
          muscleGroups,
          selectedMuscleId,
          id => {
            setSelectedMuscleId(id);
            setShowMuscleModal(false);
          },
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
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.m,
    gap: spacing.s,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s + 4,
    paddingHorizontal: spacing.m,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.m,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
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

  // Compact Centered Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center', // Center vertically
    alignItems: 'center', // Center horizontally
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: spacing.l,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340, // Limit width for tablet/large screens
    backgroundColor: '#FFFFFF',
    borderRadius: 20, // Nice rounded corners
    maxHeight: '60%', // Don't take up full screen
    overflow: 'hidden',
    // Floating effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: 16,
  },
  closeButton: {
    padding: 4,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: 'bold',
    marginTop: -1,
  },
  modalScroll: {
    paddingVertical: 0,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: '#FAFAFA',
  },
  modalOptionSelected: {
    backgroundColor: `${colors.primary}08`,
  },
  modalOptionText: {
    ...typography.body,
    fontSize: 15,
    color: colors.textPrimary,
  },
  modalOptionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
