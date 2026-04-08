import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useGymRoutines } from '../../hooks/useGymRoutines';
import { Plus, Dumbbell, Trash2, Edit2, Calendar, Info, X, Eye } from 'lucide-react-native';

import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';
import { useRoute } from '@react-navigation/native';

import { useAuth } from '../../context/AuthContext';
import { getLocalizedExerciseName } from '../../services/localization';
import { PREDEFINED_TEMPLATES, PredefinedTemplate } from '../../data/predefinedTemplates';
import { copyPredefinedTemplateToMyRoutines } from '../../modules/training/services/predefinedTemplateService';
import { WeekDaySelector } from '../../components/training/WeekDaySelector';
import { useQueryClient } from '@tanstack/react-query';
import { WorkoutTemplate } from '../../types/requests.types';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { getDateFnsLocale } from '../../i18n/dateLocale';

export const GymRoutinesListScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'GymRoutinesList'>>();
  const { assignToDate } = route.params || {};

  const { user } = useAuth();
  const { routines, isLoading, deleteRoutine } = useGymRoutines();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<'my' | 'templates'>('my');
  const [showInfoModal, setShowInfoModal] = React.useState(false);

  // Template handling state
  const [selectedTemplate, setSelectedTemplate] = React.useState<PredefinedTemplate | null>(null);
  const [showDaySelector, setShowDaySelector] = React.useState(false);
  const [showPreviewModal, setShowPreviewModal] = React.useState(false);
  const [selectedDays, setSelectedDays] = React.useState<number[]>([]);
  const [isCopying, setIsCopying] = React.useState(false);
  const [previewExercises, setPreviewExercises] = React.useState<Map<string, string>>(new Map());
  const [isLoadingPreview, setIsLoadingPreview] = React.useState(false);
  const setsLabel = t('training.sets').replace('•', '').trim();
  const repsLabel = t('training.repsColon').replace(':', '').trim();
  const templateNameKeyById: Record<string, string> = {
    'full-body-a': 'training.templateNames.fullBodyA',
    'full-body-b': 'training.templateNames.fullBodyB',
    push: 'training.templateNames.push',
    pull: 'training.templateNames.pull',
    torso: 'training.templateNames.torso',
    legs: 'training.templateNames.legs',
    'legs-glute': 'training.templateNames.legsGlute',
  };
  const templateDescriptionKeyById: Record<string, string> = {
    'full-body-a': 'training.templateDescriptions.fullBodyA',
    'full-body-b': 'training.templateDescriptions.fullBodyB',
    push: 'training.templateDescriptions.push',
    pull: 'training.templateDescriptions.pull',
    torso: 'training.templateDescriptions.torso',
    legs: 'training.templateDescriptions.legs',
    'legs-glute': 'training.templateDescriptions.legsGlute',
  };

  const getTemplateDescription = React.useCallback(
    (template: PredefinedTemplate): string =>
      t(templateDescriptionKeyById[template.id] ?? '', { defaultValue: template.description }),
    [t],
  );
  const getTemplateName = React.useCallback(
    (template: PredefinedTemplate): string =>
      t(templateNameKeyById[template.id] ?? '', { defaultValue: template.name }),
    [t],
  );

  const handleDelete = (id: string, name: string) => {
    Alert.alert(t('training.deleteRoutineTitle'), t('training.confirmDeleteNamed', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setIsDeleting(true);
          try {
            await deleteRoutine.mutateAsync(id);
          } catch (err) {
            console.error('Error deleting routine:', err);
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  const handleCreate = () => {
    if (routines && routines.length >= 20) {
      Alert.alert(t('training.limitReached'), t('training.maxGymRoutinesMessage'), [{ text: t('common.ok') }]);
      return;
    }
    navigation.navigate('GymRoutineEditor', {});
  };

  const handleAssign = async (routine: WorkoutTemplate) => {
    if (!user || !assignToDate) return;

    try {
      const { error } = await supabase.from('workout_plans').insert({
        user_id: user.id,
        planned_date: assignToDate,
        gym_template_id: routine.id,
        status: 'planned',
      });

      if (error) throw error;
      navigation.goBack();
    } catch (_error) {
      Alert.alert(t('common.error'), t('training.scheduleRoutineError'));
    }
  };

  const handleViewTemplate = async (template: PredefinedTemplate) => {
    setSelectedTemplate(template);
    setIsLoadingPreview(true);
    setShowPreviewModal(true);

    try {
      const ids = template.exercises.map(e => e.exercise_id);
      const uniqueIds = Array.from(new Set(ids));

      const { data, error } = await supabase.from('exercises').select('id, base_name_es, base_name_en').in('id', uniqueIds);

      if (data) {
        const nameMap = new Map<string, string>();
        data.forEach(d => nameMap.set(d.id, getLocalizedExerciseName(d)));
        setPreviewExercises(nameMap);
      }

      if (error) console.error('Error fetching exercises:', error);
    } catch (err) {
      console.error('Error in handleViewTemplate:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDirectAdd = (template: PredefinedTemplate) => {
    setSelectedTemplate(template);
    setSelectedDays([]);
    setShowDaySelector(true);
  };

  const handleAddToMyRoutines = () => {
    setShowPreviewModal(false);
    setSelectedDays([]);
    // Delay slightly to allow preview modal to close smoothly
    setTimeout(() => setShowDaySelector(true), 200);
  };

  const executeCopyTemplate = async () => {
    if (!user || !selectedTemplate) return;

    setIsCopying(true);
    try {
      const targetDay = selectedDays.length > 0 ? selectedDays[0] : null;
      await copyPredefinedTemplateToMyRoutines(user.id, selectedTemplate.id, targetDay);

      // Refresh routines
      queryClient.invalidateQueries({ queryKey: ['gymRoutines'] });

      setShowDaySelector(false);
      setActiveTab('my');
      Alert.alert(t('training.routineAddedTitle'), t('training.routineAddedMessage'));
    } catch (error) {
      console.error(error);
      Alert.alert(t('common.error'), t('training.addRoutineError'));
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.navigate('TrainingHome')} style={styles.backButton}>
            <Text style={[styles.backText, { color: themeColors.primary }]}>
              {assignToDate ? t('common.cancel') : t('training.close')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.headerTitle]}>
            {assignToDate ? t('training.selectRoutine') : t('training.routines')}
          </Text>
          {!assignToDate &&
            (activeTab === 'my' ? (
              <TouchableOpacity style={styles.addButton} onPress={handleCreate}>
                <Plus size={24} color={themeColors.primary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.addButton} onPress={() => setShowInfoModal(true)}>
                <Info size={24} color={themeColors.primary} />
              </TouchableOpacity>
            ))}
        </View>

        {!assignToDate && (
          <View
            style={[styles.tabSelector, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}
          >
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'my' && [
                  styles.activeTab,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#FFFFFF' },
                ],
              ]}
              onPress={() => setActiveTab('my')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'my'
                    ? { color: themeColors.primary, fontWeight: '600' }
                    : { color: themeColors.textSecondary },
                ]}
              >
                {t('training.myRoutines')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'templates' && [
                  styles.activeTab,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#FFFFFF' },
                ],
              ]}
              onPress={() => setActiveTab('templates')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'templates'
                    ? { color: themeColors.primary, fontWeight: '600' }
                    : { color: themeColors.textSecondary },
                ]}
              >
                {t('training.templates')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isLoading} tintColor={themeColors.primary} />}
        >
          {activeTab === 'my' ? (
            <>
              {routines?.length === 0 && !isLoading && (
                <View style={styles.emptyState}>
                  <Dumbbell size={48} color={themeColors.textSecondary} style={{ opacity: 0.5 }} />
                  <Text style={[styles.emptyTitle, dynamicStyles.title]}>{t('training.noRoutines')}</Text>
                  <Text style={[styles.emptyText, dynamicStyles.subtitle]}>
                    {t('training.createFirstRoutinePrompt')}
                  </Text>
                  <TouchableOpacity style={[styles.ctaButton, dynamicStyles.primaryButton]} onPress={handleCreate}>
                    <Text style={styles.ctaButtonText}>{t('training.createRoutine')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {routines?.map(routine => (
                <View key={routine.id} style={styles.cardWrapper}>
                  <GlassCard style={[styles.card, dynamicStyles.glassCard]}>
                    <View style={styles.cardContent}>
                      <View style={styles.cardInfo}>
                        <Text style={[styles.cardTitle, dynamicStyles.title]}>{routine.base_name}</Text>
                        <Text style={[styles.cardDescription, dynamicStyles.subtitle]} numberOfLines={1}>
                          {routine.description || t('training.noDescription')}
                        </Text>
                        {routine.created_at && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Calendar size={12} color={themeColors.textSecondary} style={{ marginRight: 4 }} />
                            <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                              {format(new Date(routine.created_at), 'dd MMM yyyy', { locale: getDateFnsLocale() })}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {assignToDate ? (
                      <View
                        style={[
                          styles.cardFooter,
                          { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                        ]}
                      >
                        <TouchableOpacity
                          style={[
                            styles.startButton,
                            {
                              width: '100%',
                              alignItems: 'center',
                              backgroundColor: isDark ? 'rgba(0, 122, 255, 0.2)' : 'rgba(0, 122, 255, 0.1)',
                            },
                          ]}
                          onPress={() => handleAssign(routine)}
                        >
                          <Plus size={16} color={themeColors.primary} style={{ marginRight: 6 }} />
                          <Text style={[styles.startButtonText, { color: themeColors.primary }]}>
                            {`${t('training.addTo')} ${format(new Date(assignToDate), 'dd MMM', {
                              locale: getDateFnsLocale(),
                            })}`}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.cardFooter,
                          { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                        ]}
                      >
                        <TouchableOpacity
                          style={[styles.actionButton, dynamicStyles.secondaryButton]}
                          onPress={() => navigation.navigate('GymRoutineEditor', { routineId: routine.id })}
                        >
                          <Edit2 size={16} color={themeColors.primary} />
                          <Text style={[styles.actionButtonText, { color: themeColors.primary }]}>
                            {t('common.edit')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.deleteButton, dynamicStyles.dangerButton]}
                          onPress={() => handleDelete(routine.id, routine.base_name)}
                        >
                          <Trash2 size={16} color={themeColors.danger} />
                          <Text
                            style={[styles.actionButtonText, styles.deleteButtonText, { color: themeColors.danger }]}
                          >
                            {t('common.delete')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.startButton,
                            {
                              backgroundColor: isDark ? 'rgba(0, 122, 255, 0.2)' : 'rgba(0, 122, 255, 0.1)',
                            },
                          ]}
                          onPress={() => navigation.navigate('StartWorkout', { templateId: routine.id })}
                        >
                          <Text style={[styles.startButtonText, { color: themeColors.primary }]}>
                            {t('training.start')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </GlassCard>
                </View>
              ))}
            </>
          ) : (
            <>
              {PREDEFINED_TEMPLATES.map(template => (
                <View key={template.id} style={styles.cardWrapper}>
                  {/* Wrap entire card content in TouchableOpacity for Preview */}
                  <TouchableOpacity activeOpacity={0.9} onPress={() => handleViewTemplate(template)}>
                    <GlassCard style={[styles.card, dynamicStyles.glassCard]}>
                      <View style={styles.cardContent}>
                        <View style={styles.cardInfo}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Text style={[styles.cardTitle, dynamicStyles.title, { marginBottom: 0 }]}>
                              {getTemplateName(template)}
                            </Text>
                          </View>
                          <Text style={[styles.cardDescription, dynamicStyles.subtitle]} numberOfLines={2}>
                            {getTemplateDescription(template)}
                          </Text>
                          <Text style={[styles.cardDescription, { marginTop: 6, opacity: 0.7 }]}>
                            {t('training.exerciseCount', { count: template.exercises.length })}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.cardFooter,
                          { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                        ]}
                      >
                        {/* View Button */}
                        <TouchableOpacity
                          style={[
                            styles.actionButton,
                            {
                              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                              marginRight: spacing.s,
                            },
                          ]}
                          onPress={() => handleViewTemplate(template)}
                        >
                          <Eye size={16} color={themeColors.textSecondary} />
                          <Text style={[styles.actionButtonText, { color: themeColors.textSecondary }]}>
                            {t('training.view')}
                          </Text>
                        </TouchableOpacity>

                        {/* Add Button */}
                        <TouchableOpacity
                          style={[
                            styles.startButton,
                            {
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: isDark ? 'rgba(0, 122, 255, 0.2)' : 'rgba(0, 122, 255, 0.1)',
                            },
                          ]}
                          onPress={() => handleDirectAdd(template)}
                        >
                          <Plus size={16} color={themeColors.primary} style={{ marginRight: 6 }} />
                          <Text style={[styles.startButtonText, { color: themeColors.primary }]}>
                            {t('nutrition.add')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </ScrollView>

        {/* Loading overlay */}
        {(isDeleting || isCopying) && (
          <View style={styles.loadingOverlay}>
            <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#2C2C2E' : '#FFF' }]}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={[styles.loadingText, { color: themeColors.textPrimary }]}>
                {isDeleting ? t('training.deletingRoutine') : t('training.addingTemplate')}
              </Text>
            </View>
          </View>
        )}

        {/* Info Modal */}
        <Modal visible={showInfoModal} transparent animationType="fade" onRequestClose={() => setShowInfoModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                  {t('training.howManyDaysTrain')}
                </Text>
                <TouchableOpacity onPress={() => setShowInfoModal(false)} style={styles.modalCloseButton}>
                  <X size={24} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  {t('training.recommendationsByFreq')}
                </Text>

                {/* 1 día */}
                <View style={[styles.frequencyCard, { borderLeftColor: themeColors.primary }]}>
                  <Text style={[styles.frequencyBadge, { color: themeColors.primary }]}>
                    {t('training.frequency1Day')}
                  </Text>
                  <Text style={[styles.frequencyRoutine, { color: themeColors.textPrimary }]}>
                    {t('training.splitFullBodyA')}
                  </Text>
                  <Text style={[styles.frequencyNote, { color: themeColors.textSecondary }]}>
                    {t('training.fullBodyAltSuggestion')}
                  </Text>
                </View>

                {/* 2 días */}
                <View style={[styles.frequencyCard, { borderLeftColor: themeColors.primary }]}>
                  <Text style={[styles.frequencyBadge, { color: themeColors.primary }]}>
                    {t('training.frequency2Days')}
                  </Text>
                  <Text style={[styles.frequencyRoutine, { color: themeColors.textPrimary }]}>
                    {t('training.splitFullBodyAB')}
                  </Text>
                </View>

                {/* 3 días */}
                <View
                  style={[
                    styles.frequencyCard,
                    styles.recommendedCard,
                    {
                      borderLeftColor: '#34C759',
                      backgroundColor: isDark ? 'rgba(52,199,89,0.08)' : 'rgba(52,199,89,0.05)',
                    },
                  ]}
                >
                  <Text style={[styles.frequencyBadge, { color: '#34C759' }]}>{t('training.frequency3Days')}</Text>
                  <Text style={[styles.frequencyRoutine, { color: themeColors.textPrimary }]}>
                    {t('training.splitPushPullLegs')}
                  </Text>
                  <Text style={[styles.frequencyNote, { color: themeColors.textSecondary }]}>
                    {t('training.legGluteSuggestion')}
                  </Text>
                </View>

                {/* 4 días */}
                <View style={[styles.frequencyCard, { borderLeftColor: themeColors.primary }]}>
                  <Text style={[styles.frequencyBadge, { color: themeColors.primary }]}>
                    {t('training.frequency4Days')}
                  </Text>
                  <Text style={[styles.frequencyRoutine, { color: themeColors.textPrimary }]}>
                    {t('training.splitPushPullLegsTorso')}
                  </Text>
                  <Text style={[styles.frequencyNote, { color: themeColors.textSecondary }]}>
                    {t('training.legGluteSuggestion')}
                  </Text>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: themeColors.primary }]}
                onPress={() => setShowInfoModal(false)}
              >
                <Text style={styles.modalButtonText}>{t('common.gotIt')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Preview Modal */}
        <Modal
          visible={showPreviewModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPreviewModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', maxHeight: '80%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                  {selectedTemplate ? getTemplateName(selectedTemplate) : ''}
                </Text>
                <TouchableOpacity onPress={() => setShowPreviewModal(false)} style={styles.modalCloseButton}>
                  <X size={24} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary, marginBottom: spacing.m }]}>
                  {selectedTemplate ? getTemplateDescription(selectedTemplate) : ''}
                </Text>

                <Text
                  style={[styles.modalSubtitle, { color: themeColors.textPrimary, fontWeight: '700', marginBottom: 8 }]}
                >
                  {t('training.exerciseCount', { count: selectedTemplate?.exercises.length ?? 0 })}
                </Text>

                {isLoadingPreview ? (
                  <ActivityIndicator size="small" color={themeColors.primary} style={{ marginTop: 20 }} />
                ) : (
                  selectedTemplate?.exercises.map((ex, idx) => (
                    <View
                      key={idx}
                      style={{
                        flexDirection: 'row',
                        marginBottom: 8,
                        paddingBottom: 8,
                        borderBottomWidth: idx === selectedTemplate.exercises.length - 1 ? 0 : 1,
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      }}
                    >
                      <View style={{ width: 24, alignItems: 'center', marginRight: 8 }}>
                        <Text style={{ color: themeColors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                          {`${idx + 1}.`}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: themeColors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                          {previewExercises.get(ex.exercise_id) || 'Cargando nombre...'}
                        </Text>
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                          {ex.target_sets +
                            ` ${setsLabel} · ${ex.target_reps_min ?? ex.target_reps_max ?? 8} ${repsLabel}`}
                        </Text>
                        {ex.notes && (
                          <Text
                            style={{
                              color: themeColors.textSecondary,
                              fontSize: 11,
                              fontStyle: 'italic',
                              marginTop: 2,
                            }}
                          >
                            {t('training.note')}
                            {ex.notes}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: themeColors.primary, marginTop: spacing.m }]}
                onPress={handleAddToMyRoutines}
              >
                <Text style={styles.modalButtonText}>{t('training.addToMyRoutines')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Day Selector Modal for Copying */}
        <Modal
          visible={showDaySelector}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDaySelector(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                  {t('training.configureRoutine')}
                </Text>
                <TouchableOpacity onPress={() => setShowDaySelector(false)} style={styles.modalCloseButton}>
                  <X size={24} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary, marginBottom: spacing.m }]}>
                  {t('training.whichDayForRoutine')}
                  {selectedTemplate ? getTemplateName(selectedTemplate) : ''}"
                </Text>

                <WeekDaySelector selectedDays={selectedDays} onDaysChange={setSelectedDays} singleSelect={true} />

                <Text
                  style={[
                    styles.frequencyNote,
                    { color: themeColors.textSecondary, marginTop: spacing.m, textAlign: 'center' },
                  ]}
                >
                  {t('training.routineScheduleNote')}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: themeColors.primary,
                    marginTop: spacing.s,
                    opacity: isCopying ? 0.8 : 1,
                  },
                ]}
                onPress={executeCopyTemplate}
                disabled={isCopying}
              >
                {isCopying ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonText}>{t('training.confirmAndAdd')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: colors.background, // Removed for gradient
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
  },
  backButton: {
    padding: spacing.s,
  },
  backText: {
    ...typography.body,
    color: colors.primary,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  addButton: {
    padding: spacing.s,
  },
  content: {
    padding: spacing.l,
    paddingTop: spacing.m,
    paddingBottom: 100,
  },
  tabSelector: {
    flexDirection: 'row',
    marginHorizontal: spacing.l,
    marginBottom: spacing.m,
    padding: 4,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.s,
    alignItems: 'center',
    borderRadius: borderRadius.full,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    gap: spacing.m,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.l,
  },
  ctaButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.full,
    marginTop: spacing.m,
  },
  ctaButtonText: {
    ...typography.h4,
    color: '#FFFFFF',
  },
  cardWrapper: {
    marginBottom: spacing.m,
  },
  card: {
    padding: spacing.m,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.m,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    ...typography.h3,
    marginBottom: 4,
  },
  cardDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: spacing.m,
  },
  startButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingHorizontal: spacing.m,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  startButtonText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingHorizontal: spacing.m,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    gap: 6,
    marginRight: spacing.s,
  },
  actionButtonText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteButtonText: {
    color: colors.danger,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingContainer: {
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '70%',
    borderRadius: 16,
    padding: spacing.m,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  modalTitle: {
    ...typography.h4,
    flex: 1,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    marginBottom: spacing.s,
  },
  modalSubtitle: {
    ...typography.caption,
    marginBottom: spacing.s,
  },
  frequencyCard: {
    padding: spacing.s,
    paddingLeft: spacing.m,
    borderLeftWidth: 3,
    borderRadius: 8,
    marginBottom: spacing.s,
  },
  recommendedCard: {
    borderLeftWidth: 3,
  },
  frequencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  frequencyBadge: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 11,
  },
  frequencyBadgeText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  recommendedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.xs,
  },
  recommendedLabel: {
    ...typography.caption,
    color: '#34C759',
    fontWeight: '600',
  },
  frequencyRoutine: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  frequencyNote: {
    ...typography.caption,
    fontSize: 11,
    marginTop: 4,
  },
  modalButton: {
    paddingVertical: spacing.s + 2,
    borderRadius: borderRadius.l,
    alignItems: 'center',
  },
  modalButtonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  frequencyBadgeContainer: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  frequencyBadgeTextSimple: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
