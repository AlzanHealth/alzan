import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { SPORT_COLORS } from '../../theme/sportColors';
import { EnduranceTemplate, useEnduranceTemplates } from '../../hooks/useEnduranceTemplates';
import { Plus, Activity, Trash2, Edit2, Play } from 'lucide-react-native';
import { SportIcon } from '../../components/icons/SportIcon';

import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';

import { useAuth } from '../../context/AuthContext';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { useSportCatalog } from '../../hooks/useSportCatalog';
import { TemplateListManagementMenu } from './components/TemplateListManagementMenu';
import { TemplateSelectionCheckbox } from './components/TemplateSelectionCheckbox';
import { TemplateSelectionToolbar } from './components/TemplateSelectionToolbar';
import { useTabBarLayout } from '../../navigation/tabBarLayout';
import {
  getTemplateListContentBottomPadding,
  getTemplateListHeaderAction,
  getTemplateMetadataLabel,
  getSelectedTemplateIdsForBulkDelete,
  getTemplateIdsForBulkDelete,
  sortTemplateList,
  TemplateListSort,
  toggleTemplateSelection,
} from './helpers/templateList.helper';

export const SportTemplatesListScreen = () => {
  const { t, i18n } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const { topFromScreenBottom } = useTabBarLayout();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'SportTemplatesList'>>();
  const { assignToDate } = route.params || {}; // YYYY-MM-DD string
  const isTemplateSelectionMode = Boolean(assignToDate);
  const selectionDateLabel = assignToDate
    ? format(new Date(assignToDate), 'dd MMM', { locale: getDateFnsLocale() })
    : '';

  const { user } = useAuth();
  const { templates, isLoading, deleteTemplate } = useEnduranceTemplates();
  const { getOptionLabel } = useSportCatalog();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [sortOrder, setSortOrder] = React.useState<TemplateListSort>('created');
  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = React.useState<Set<string>>(() => new Set());
  const headerAction = getTemplateListHeaderAction(isTemplateSelectionMode, isSelectionMode);

  const sortedTemplates = React.useMemo(
    () =>
      sortTemplateList(
        templates.map(template => ({
          ...template,
          name: template.base_name,
          createdAt: template.created_at,
          usageCount: template.usage_count ?? 0,
        })),
        sortOrder,
        i18n.language,
      ),
    [i18n.language, sortOrder, templates],
  );

  const getSportLabel = React.useCallback(
    (sportType: string) => {
      switch (sportType) {
        case 'running':
          return t('constants.running');
        case 'cycling':
          return t('constants.cycling');
        case 'swimming':
          return t('constants.swimming');
        default:
          return sportType.charAt(0).toUpperCase() + sportType.slice(1);
      }
    },
    [t],
  );

  const handleDelete = (id: string, name: string) => {
    Alert.alert(t('training.deleteTemplateTitle'), t('training.confirmDeleteNamed', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setIsDeleting(true);
          try {
            await deleteTemplate.mutateAsync(id);
          } catch (err) {
            console.error('Error deleting template:', err);
            Alert.alert(t('common.error'), t('training.deleteTemplateError'), [{ text: t('common.ok') }]);
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  const handleDeleteAll = async () => {
    if (isDeleting) return;
    const ids = getTemplateIdsForBulkDelete(sortedTemplates);
    if (ids.length === 0) return;

    setIsDeleting(true);
    try {
      for (const id of ids) await deleteTemplate.mutateAsync(id);
    } catch (error) {
      console.error('Error deleting all templates:', error);
      Alert.alert(t('common.error'), t('training.deleteTemplateError'), [{ text: t('common.ok') }]);
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedTemplateIds(new Set());
  };
  const deleteSelected = () => {
    const ids = getSelectedTemplateIdsForBulkDelete(sortedTemplates, selectedTemplateIds);
    if (!ids.length || isDeleting) return;
    Alert.alert(
      t('training.deleteSelectedTemplatesTitle'),
      t('training.deleteSelectedTemplatesMessage', { count: ids.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('training.deleteSelectedTemplatesAction', { count: ids.length }),
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            let completed = 0;
            try {
              for (const id of ids) {
                await deleteTemplate.mutateAsync(id);
                completed += 1;
              }
              cancelSelection();
            } catch (error) {
              console.error('Error deleting selected templates:', error);
              setSelectedTemplateIds(new Set(ids.slice(completed)));
              Alert.alert(t('common.error'), t('training.deleteTemplateError'), [{ text: t('common.ok') }]);
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleEdit = (id: string) => {
    navigation.navigate('EnduranceWorkoutBuilder', { templateId: id });
  };

  const handleCreate = () => {
    if (templates && templates.length >= 20) {
      Alert.alert(t('training.limitReached'), t('training.maxSportTemplatesMessage'), [{ text: t('common.ok') }]);
      return;
    }
    navigation.navigate('EnduranceWorkoutBuilder', {});
  };

  const handleAssign = async (template: EnduranceTemplate) => {
    if (!user || !assignToDate) return;

    try {
      const { error } = await supabase.from('workout_plans').insert({
        user_id: user.id,
        planned_date: assignToDate,
        endurance_template_id: template.id,
        status: 'planned',
      });

      if (error) throw error;

      navigation.goBack();
    } catch (_error) {
      Alert.alert(t('common.error'), t('training.scheduleWorkoutError'));
    }
  };

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (isSelectionMode) cancelSelection();
              else if (headerAction === 'back') navigation.goBack();
              else navigation.navigate('TrainingHome');
            }}
            style={styles.backButton}
          >
            <Text style={[styles.backText, { color: themeColors.primary }]}>
              {headerAction === 'back' ? t('common.back') : t('common.close')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.headerTitle]}>
            {isTemplateSelectionMode ? t('training.selectTemplate') : t('training.myTemplates')}
          </Text>
          {!isTemplateSelectionMode && !isSelectionMode && (
            <View style={styles.headerActions}>
              <TemplateListManagementMenu
                itemCount={templates.length}
                sort={sortOrder}
                isDeleting={isDeleting}
                onSortChange={setSortOrder}
                onDeleteAll={handleDeleteAll}
                onStartSelection={() => {
                  setSelectedTemplateIds(new Set());
                  setIsSelectionMode(true);
                }}
              />
              <TouchableOpacity style={styles.addButton} onPress={handleCreate}>
                <Plus size={24} color={themeColors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: getTemplateListContentBottomPadding(topFromScreenBottom, isSelectionMode) },
          ]}
          refreshControl={<RefreshControl refreshing={isLoading} tintColor={themeColors.primary} />}
        >
          {templates?.length === 0 && !isLoading && (
            <View style={styles.emptyState}>
              <Activity size={48} color={themeColors.textSecondary} style={{ opacity: 0.5 }} />
              <Text style={[styles.emptyTitle, dynamicStyles.title]}>{t('training.noTemplates')}</Text>
              <Text style={[styles.emptyText, dynamicStyles.subtitle]}>{t('training.createFirstTemplatePrompt')}</Text>
              <TouchableOpacity style={[styles.ctaButton, dynamicStyles.primaryButton]} onPress={handleCreate}>
                <Text style={styles.ctaButtonText}>{t('training.createTemplate')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {sortedTemplates.map(template => {
            const goalLabel = template.workout_goal
              ? getOptionLabel(template.sport_type, template.workout_goal, 'goal')
              : t('training.noGoal');

            return (
              <View key={template.id} style={styles.cardWrapper}>
                <Pressable
                  disabled={!isSelectionMode || isDeleting}
                  onPress={() => setSelectedTemplateIds(current => toggleTemplateSelection(current, template.id))}
                  accessibilityRole={isSelectionMode ? 'checkbox' : undefined}
                  accessibilityLabel={t('training.selectTemplateNamed', { name: template.base_name })}
                  accessibilityState={
                    isSelectionMode
                      ? { checked: selectedTemplateIds.has(template.id), disabled: isDeleting }
                      : undefined
                  }
                >
                  <GlassCard style={[styles.card, dynamicStyles.glassCard]}>
                    <View style={[styles.cardContent, isSelectionMode && styles.selectionCardContent]}>
                      {isSelectionMode && (
                        <TemplateSelectionCheckbox
                          checked={selectedTemplateIds.has(template.id)}
                          primaryColor={themeColors.primary}
                          borderColor={themeColors.border}
                        />
                      )}
                      <View
                        style={[
                          styles.iconContainer,
                          {
                            backgroundColor: SPORT_COLORS[template.sport_type] || themeColors.primary,
                          },
                        ]}
                      >
                        <SportIcon sport={template.sport_type} size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={[styles.cardTitle, dynamicStyles.title]}>{template.base_name}</Text>
                        <Text style={[styles.cardDescription, dynamicStyles.subtitle]} numberOfLines={2}>
                          {getTemplateMetadataLabel(
                            getSportLabel(template.sport_type),
                            goalLabel,
                            template.created_at
                              ? format(new Date(template.created_at), 'dd MMM yyyy', { locale: getDateFnsLocale() })
                              : undefined,
                          )}
                        </Text>
                      </View>
                    </View>

                    {isTemplateSelectionMode ? (
                      <View
                        style={[
                          styles.cardFooter,
                          { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                        ]}
                      >
                        <TouchableOpacity
                          style={[
                            styles.actionButton,
                            {
                              backgroundColor: themeColors.primary,
                              width: '100%',
                              justifyContent: 'center',
                            },
                          ]}
                          onPress={() => handleAssign(template)}
                        >
                          <Plus size={16} color="#FFFFFF" />
                          <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>
                            {`${t('training.addTo')} ${selectionDateLabel}`}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : isSelectionMode ? null : (
                      <View
                        style={[
                          styles.cardFooter,
                          { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                        ]}
                      >
                        <TouchableOpacity
                          style={[styles.actionButton, { backgroundColor: themeColors.primary, marginRight: 'auto' }]}
                          onPress={() => navigation.navigate('EnduranceSessionForm', { templateId: template.id })}
                        >
                          <Play size={16} color="#FFFFFF" />
                          <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>{t('training.register')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionButton, dynamicStyles.secondaryButton]}
                          onPress={() => handleEdit(template.id)}
                        >
                          <Edit2 size={18} color={themeColors.primary} />
                          <Text style={[styles.actionButtonText, { color: themeColors.primary }]}>
                            {t('common.edit')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.deleteButton, dynamicStyles.dangerButton]}
                          onPress={() => handleDelete(template.id, template.base_name)}
                        >
                          <Trash2 size={18} color={themeColors.danger} />
                          <Text
                            style={[styles.actionButtonText, styles.deleteButtonText, { color: themeColors.danger }]}
                          >
                            {t('common.delete')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </GlassCard>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>

        {isSelectionMode && !isTemplateSelectionMode && (
          <TemplateSelectionToolbar
            selectedCount={getSelectedTemplateIdsForBulkDelete(sortedTemplates, selectedTemplateIds).length}
            isDeleting={isDeleting}
            onCancel={cancelSelection}
            onDelete={deleteSelected}
          />
        )}

        {/* Loading overlay */}
        {isDeleting && (
          <View style={styles.loadingOverlay}>
            <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#2C2C2E' : '#FFF' }]}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={[styles.loadingText, { color: themeColors.textPrimary }]}>
                {t('training.deletingTemplate')}
              </Text>
            </View>
          </View>
        )}
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  content: {
    padding: spacing.l,
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
    marginBottom: spacing.m,
  },
  selectionCardContent: { marginBottom: 0 },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.m,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  cardDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: spacing.m,
    gap: spacing.s,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingHorizontal: spacing.s,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  actionButtonText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    fontSize: 12,
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
});
