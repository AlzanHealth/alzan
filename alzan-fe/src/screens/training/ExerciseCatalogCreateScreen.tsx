import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Check, ChevronRight, Dumbbell, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Alert } from '../../components/common/Alert';
import { useAuth } from '../../context/AuthContext';
import { useEquipment } from '../../hooks/useEquipment';
import { useMuscleGroups } from '../../hooks/useMuscleGroups';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { borderRadius, spacing, typography } from '../../theme';
import { ExerciseWithDetails } from '../../types/training';
import { TrainingScreenNavigationProp } from '../../types/navigation.types';
import { ExerciseLoadType, normalizeSearchText } from '../../services/localization';
import { useExercises } from '../../hooks/useExercises';
import { useCreateCustomExercise } from '../../modules/training/hooks/useExerciseCatalog';
import {
  ExerciseNameAlreadyExistsError,
  normalizeExerciseCatalogName,
} from '../../modules/training/services/exerciseCatalogService';

type Selector = 'primaryMuscle' | 'secondaryMuscle' | 'equipment' | null;

const LOAD_TYPES: ExerciseLoadType[] = ['external', 'bodyweight', 'assisted', 'mixed'];

export const ExerciseCatalogCreateScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const { user } = useAuth();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const { muscleGroups, isLoading: isLoadingMuscles } = useMuscleGroups();
  const { equipment, isLoading: isLoadingEquipment } = useEquipment();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [primaryMuscleId, setPrimaryMuscleId] = useState<number | null>(null);
  const [secondaryMuscleId, setSecondaryMuscleId] = useState<number | null>(null);
  const [equipmentId, setEquipmentId] = useState<number | null>(null);
  const [loadType, setLoadType] = useState<ExerciseLoadType>('external');
  const [selector, setSelector] = useState<Selector>(null);
  const createExercise = useCreateCustomExercise(user?.id);
  const normalizedName = normalizeExerciseCatalogName(name);
  const normalizedSearchText = normalizeSearchText(name);
  const { exercises: searchMatches, isLoading: isSearching } = useExercises({
    searchQuery: name.trim(),
    limit: 8,
  });

  const exactMatch = useMemo(
    () =>
      searchMatches.find(exercise => {
        const normalizedSpanishName = normalizeExerciseCatalogName(exercise.base_name_es ?? '');
        const normalizedEnglishName = normalizeExerciseCatalogName(exercise.base_name_en ?? '');
        return (
          normalizedName !== '' &&
          (normalizedName === normalizedSpanishName || normalizedName === normalizedEnglishName)
        );
      }),
    [normalizedName, searchMatches],
  );

  const similarMatches = useMemo(
    () =>
      searchMatches
        .filter(exercise => exercise.id !== exactMatch?.id)
        .filter(exercise => {
          const names = [exercise.name, exercise.base_name_es, exercise.base_name_en].filter(
            (value): value is string => !!value,
          );
          return names.some(value => normalizeSearchText(value) !== normalizedSearchText);
        })
        .slice(0, 4),
    [exactMatch?.id, searchMatches],
  );

  const selectedPrimaryMuscle = muscleGroups.find(item => item.id === primaryMuscleId);
  const selectedSecondaryMuscle = muscleGroups.find(item => item.id === secondaryMuscleId);
  const selectedEquipment = equipment.find(item => item.id === equipmentId);

  const openMatch = (exercise: ExerciseWithDetails) => {
    navigation.navigate('ExerciseDetail', { exercise });
  };

  const handleCreate = async () => {
    const trimmedName = name.trim().replace(/\s+/g, ' ');
    if (!user || trimmedName.length < 2 || primaryMuscleId === null || exactMatch || isSearching) return;

    try {
      await createExercise.mutateAsync({
        name: trimmedName,
        primaryMuscleId,
        secondaryMuscleId,
        equipmentId,
        loadType,
        description,
      });
      navigation.goBack();
    } catch (error) {
      const isDuplicate = error instanceof ExerciseNameAlreadyExistsError;
      Alert.alert(
        t(isDuplicate ? 'training.exerciseCatalogDuplicateTitle' : 'common.error'),
        t(isDuplicate ? 'training.exerciseCatalogExactDuplicate' : 'training.exerciseCatalogCreateError'),
      );
    }
  };

  const openSelector = (nextSelector: Exclude<Selector, null>) => setSelector(nextSelector);
  const closeSelector = () => setSelector(null);

  const selectOption = (id: number | null) => {
    if (selector === 'primaryMuscle') setPrimaryMuscleId(id);
    if (selector === 'secondaryMuscle') setSecondaryMuscleId(id);
    if (selector === 'equipment') setEquipmentId(id);
    closeSelector();
  };

  const selectorTitle =
    selector === 'primaryMuscle'
      ? t('training.exerciseCatalogPrimaryMuscle')
      : selector === 'secondaryMuscle'
        ? t('training.exerciseCatalogSecondaryMuscle')
        : t('training.exerciseCatalogEquipment');
  const selectorOptions = selector === 'equipment' ? equipment : muscleGroups;
  const selectedOptionId =
    selector === 'primaryMuscle' ? primaryMuscleId : selector === 'secondaryMuscle' ? secondaryMuscleId : equipmentId;
  const selectorIsLoading = selector === 'equipment' ? isLoadingEquipment : isLoadingMuscles;

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.navigationHeader}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <ArrowLeft size={23} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.navigationTitle, dynamicStyles.title]}>{t('training.exerciseCatalogNewTitle')}</Text>
          <View style={styles.backButton} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoiding}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.heading, dynamicStyles.title]}>{t('training.exerciseCatalogNewHeading')}</Text>
            <Text style={[styles.subtitle, dynamicStyles.sublabel]}>{t('training.exerciseCatalogNewSubtitle')}</Text>

            <Text style={[styles.fieldLabel, dynamicStyles.label]}>{t('training.exerciseCatalogNameLabel')}</Text>
            <TextInput
              accessibilityLabel={t('training.exerciseCatalogNameLabel')}
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={80}
              onChangeText={setName}
              placeholder={t('training.exerciseCatalogNamePlaceholder')}
              placeholderTextColor={themeColors.textSecondary}
              returnKeyType="next"
              style={[styles.textInput, dynamicStyles.input, { color: themeColors.textPrimary }]}
              value={name}
            />

            {normalizedName.length >= 2 && (isSearching || exactMatch || similarMatches.length > 0) ? (
              <View
                style={[
                  styles.matchesCard,
                  {
                    backgroundColor: exactMatch
                      ? isDark
                        ? 'rgba(255,149,0,0.12)'
                        : '#FFF8E9'
                      : dynamicStyles.card.backgroundColor,
                    borderColor: exactMatch ? `${themeColors.warning}65` : themeColors.border,
                  },
                ]}
              >
                {isSearching ? (
                  <View style={styles.matchLoading}>
                    <ActivityIndicator size="small" color={themeColors.primary} />
                    <Text style={[styles.matchHelper, dynamicStyles.sublabel]}>
                      {t('training.exerciseCatalogChecking')}
                    </Text>
                  </View>
                ) : exactMatch ? (
                  <>
                    <Text style={[styles.matchTitle, { color: themeColors.warning }]}>
                      {t('training.exerciseCatalogDuplicateTitle')}
                    </Text>
                    <Text style={[styles.matchHelper, dynamicStyles.sublabel]}>
                      {t('training.exerciseCatalogExactDuplicate')}
                    </Text>
                    <TouchableOpacity style={styles.matchRow} onPress={() => openMatch(exactMatch)}>
                      <View style={styles.matchCopy}>
                        <Text style={[styles.matchName, dynamicStyles.label]} numberOfLines={2}>
                          {exactMatch.name}
                        </Text>
                        <Text style={[styles.matchMeta, dynamicStyles.sublabel]} numberOfLines={1}>
                          {[exactMatch.muscle_name, exactMatch.equipment_name].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text style={[styles.exactBadge, { color: themeColors.warning }]}>
                        {t('training.exerciseCatalogExactBadge')}
                      </Text>
                      <ChevronRight size={18} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                  </>
                ) : similarMatches.length > 0 ? (
                  <>
                    <Text style={[styles.matchTitle, { color: themeColors.warning }]}>
                      {t('training.exerciseCatalogSimilarTitle')}
                    </Text>
                    <Text style={[styles.matchHelper, dynamicStyles.sublabel]}>
                      {t('training.exerciseCatalogSimilarHint')}
                    </Text>
                    {similarMatches.map(exercise => (
                      <TouchableOpacity
                        key={exercise.id}
                        accessibilityRole="button"
                        style={[styles.matchRow, { borderTopColor: themeColors.border }]}
                        onPress={() => openMatch(exercise)}
                      >
                        <View style={styles.matchCopy}>
                          <Text style={[styles.matchName, dynamicStyles.label]} numberOfLines={2}>
                            {exercise.name}
                          </Text>
                          <Text style={[styles.matchMeta, dynamicStyles.sublabel]} numberOfLines={1}>
                            {[exercise.muscle_name, exercise.equipment_name].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <Text style={[styles.similarBadge, { color: themeColors.warning }]}>
                          {t('training.exerciseCatalogSimilarBadge')}
                        </Text>
                        <ChevronRight size={18} color={themeColors.textSecondary} />
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null}
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, dynamicStyles.label]}>{t('training.exerciseCatalogPrimaryMuscle')}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => openSelector('primaryMuscle')}
              style={[styles.selectField, dynamicStyles.input]}
            >
              <Text
                style={[
                  styles.selectValue,
                  { color: selectedPrimaryMuscle ? themeColors.textPrimary : themeColors.textSecondary },
                ]}
              >
                {selectedPrimaryMuscle?.name ?? t('training.exerciseCatalogSelectMuscle')}
              </Text>
              <ChevronRight size={19} color={themeColors.textSecondary} />
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, dynamicStyles.label]}>{t('training.exerciseCatalogSecondaryMuscle')}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => openSelector('secondaryMuscle')}
              style={[styles.selectField, dynamicStyles.input]}
            >
              <Text
                style={[
                  styles.selectValue,
                  { color: selectedSecondaryMuscle ? themeColors.textPrimary : themeColors.textSecondary },
                ]}
              >
                {selectedSecondaryMuscle?.name ?? t('training.exerciseCatalogOptional')}
              </Text>
              <ChevronRight size={19} color={themeColors.textSecondary} />
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, dynamicStyles.label]}>{t('training.exerciseCatalogEquipment')}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => openSelector('equipment')}
              style={[styles.selectField, dynamicStyles.input]}
            >
              <Text
                style={[
                  styles.selectValue,
                  { color: selectedEquipment ? themeColors.textPrimary : themeColors.textSecondary },
                ]}
              >
                {selectedEquipment?.name ?? t('training.exerciseCatalogOptional')}
              </Text>
              <ChevronRight size={19} color={themeColors.textSecondary} />
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, dynamicStyles.label]}>{t('training.exerciseCatalogLoadType')}</Text>
            <View style={styles.loadTypeOptions}>
              {LOAD_TYPES.map(option => {
                const selected = loadType === option;
                return (
                  <TouchableOpacity
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setLoadType(option)}
                    style={[
                      styles.loadTypeOption,
                      {
                        backgroundColor: selected ? `${themeColors.primary}14` : dynamicStyles.card.backgroundColor,
                        borderColor: selected ? themeColors.primary : themeColors.border,
                      },
                    ]}
                  >
                    {selected ? <Check size={15} color={themeColors.primary} /> : null}
                    <Text
                      style={[
                        styles.loadTypeText,
                        { color: selected ? themeColors.primary : themeColors.textSecondary },
                      ]}
                    >
                      {t(`training.exerciseCatalogLoadType_${option}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, dynamicStyles.label]}>{t('training.exerciseCatalogDescription')}</Text>
            <TextInput
              accessibilityLabel={t('training.exerciseCatalogDescription')}
              maxLength={500}
              multiline
              onChangeText={setDescription}
              placeholder={t('training.exerciseCatalogDescriptionPlaceholder')}
              placeholderTextColor={themeColors.textSecondary}
              style={[styles.descriptionInput, dynamicStyles.input, { color: themeColors.textPrimary }]}
              textAlignVertical="top"
              value={description}
            />

            <View style={[styles.scopeNote, { backgroundColor: `${themeColors.primary}12` }]}>
              <Dumbbell size={18} color={themeColors.primary} />
              <View style={styles.scopeNoteCopy}>
                <Text style={[styles.scopeNoteTitle, { color: themeColors.primary }]}>
                  {t('training.exerciseCatalogMineBadge')}
                </Text>
                <Text style={[styles.scopeNoteBody, dynamicStyles.sublabel]}>
                  {t('training.exerciseCatalogMineHint')}
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={
              name.trim().length < 2 ||
              primaryMuscleId === null ||
              !!exactMatch ||
              isSearching ||
              createExercise.isPending
            }
            onPress={() => void handleCreate()}
            style={[
              styles.saveButton,
              { backgroundColor: themeColors.primary },
              (name.trim().length < 2 ||
                primaryMuscleId === null ||
                !!exactMatch ||
                isSearching ||
                createExercise.isPending) &&
                styles.disabledButton,
            ]}
          >
            {createExercise.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>{t('training.exerciseCatalogSaveAction')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <Modal
          visible={selector !== null}
          animationType="slide"
          transparent
          onRequestClose={closeSelector}
          statusBarTranslucent
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.selectorSheet, { backgroundColor: themeColors.cardBackground }]}>
              <View style={styles.selectorHeader}>
                <Text style={[styles.selectorTitle, dynamicStyles.title]}>{selectorTitle}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                  hitSlop={8}
                  onPress={closeSelector}
                  style={styles.closeButton}
                >
                  <X size={21} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>
              {selectorIsLoading ? (
                <ActivityIndicator style={styles.selectorLoading} color={themeColors.primary} />
              ) : (
                <FlatList
                  data={selectorOptions}
                  keyExtractor={item => String(item.id)}
                  renderItem={({ item }) => {
                    const selected = selectedOptionId === item.id;
                    return (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => selectOption(item.id)}
                        style={[styles.selectorRow, { borderBottomColor: themeColors.border }]}
                      >
                        <Text style={[styles.selectorRowText, dynamicStyles.label]}>{item.name}</Text>
                        {selected ? <Check size={18} color={themeColors.primary} /> : null}
                      </TouchableOpacity>
                    );
                  }}
                  ListHeaderComponent={
                    selector === 'secondaryMuscle' || selector === 'equipment' ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => selectOption(null)}
                        style={[styles.selectorRow, { borderBottomColor: themeColors.border }]}
                      >
                        <Text style={[styles.selectorRowText, dynamicStyles.sublabel]}>
                          {t('training.exerciseCatalogOptional')}
                        </Text>
                        {selectedOptionId === null ? <Check size={18} color={themeColors.primary} /> : null}
                      </TouchableOpacity>
                    ) : null
                  }
                  contentContainerStyle={styles.selectorList}
                />
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardAvoiding: { flex: 1 },
  navigationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
  },
  navigationTitle: { ...typography.h4, flex: 1, textAlign: 'center' },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  formContent: { paddingBottom: spacing.l, paddingHorizontal: spacing.m },
  heading: { ...typography.h2, marginTop: spacing.s },
  subtitle: { ...typography.caption, lineHeight: 18, marginBottom: spacing.m, marginTop: spacing.xs },
  fieldLabel: { ...typography.body, fontSize: 14, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.m },
  textInput: {
    borderRadius: borderRadius.m,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: spacing.m,
  },
  matchesCard: {
    borderRadius: borderRadius.m,
    borderWidth: 1,
    marginTop: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  matchLoading: { alignItems: 'center', flexDirection: 'row', gap: spacing.s, minHeight: 40 },
  matchTitle: { fontSize: 13, fontWeight: '700', marginTop: spacing.xs },
  matchHelper: { ...typography.caption, lineHeight: 17, marginBottom: spacing.xs, marginTop: 3 },
  matchRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 58,
    paddingVertical: spacing.s,
  },
  matchCopy: { flex: 1, minWidth: 0 },
  matchName: { fontSize: 13, fontWeight: '600' },
  matchMeta: { fontSize: 10, marginTop: 3 },
  exactBadge: { fontSize: 9, fontWeight: '800' },
  similarBadge: { fontSize: 9, fontWeight: '700' },
  selectField: {
    alignItems: 'center',
    borderRadius: borderRadius.m,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.m,
  },
  selectValue: { fontSize: 14, fontWeight: '500' },
  loadTypeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  loadTypeOption: {
    alignItems: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.s,
  },
  loadTypeText: { fontSize: 11, fontWeight: '600' },
  descriptionInput: { borderRadius: borderRadius.m, borderWidth: 1, fontSize: 14, minHeight: 96, padding: spacing.m },
  scopeNote: {
    alignItems: 'flex-start',
    borderRadius: borderRadius.m,
    flexDirection: 'row',
    gap: spacing.s,
    marginTop: spacing.l,
    padding: spacing.m,
  },
  scopeNoteCopy: { flex: 1 },
  scopeNoteTitle: { fontSize: 13, fontWeight: '700' },
  scopeNoteBody: { ...typography.caption, lineHeight: 17, marginTop: 3 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.m, paddingTop: spacing.s },
  saveButton: { alignItems: 'center', borderRadius: borderRadius.m, justifyContent: 'center', minHeight: 52 },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'flex-end' },
  selectorSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '78%',
    paddingBottom: spacing.l,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
  },
  selectorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.s,
  },
  selectorTitle: { ...typography.h4 },
  closeButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  selectorLoading: { marginVertical: spacing.l },
  selectorList: { paddingBottom: spacing.s },
  selectorRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  selectorRowText: { fontSize: 14 },
});
