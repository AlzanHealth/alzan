import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Copy, Dumbbell, Upload } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/common/Alert';
import { GlassCard } from '../../components/GlassCard';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useTrainingPlanImport } from '../../hooks/useTrainingPlanImport';
import {
  TRAINING_PLAN_IMPORT_TEMPLATE,
  TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT,
} from '../../modules/training/services/trainingPlanImportTemplate';
import type { TrainingScreenNavigationProp } from '../../types/navigation.types';

const copyText = async (text: string): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === 'undefined') throw new Error('Clipboard unavailable');
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(area);
  if (!copied) throw new Error('Clipboard copy failed');
};

export const TrainingPlanImportScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const { width } = useWindowDimensions();
  const { styles: dynamicStyles, colors } = useTrainingStyles();
  const showCopyLabel = width >= 720;
  const [isCopyingTemplate, setIsCopyingTemplate] = useState(false);
  const isCopyingTemplateRef = useRef(false);
  const {
    rawJson,
    setRawJson,
    validationErrors,
    document,
    isAnalyzing,
    analysisProgress,
    isImporting,
    canImport,
    analyze,
    importPlan,
  } = useTrainingPlanImport();

  const handleCopyTemplate = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    if (isCopyingTemplateRef.current) return;
    isCopyingTemplateRef.current = true;
    setIsCopyingTemplate(true);

    try {
      await copyText(TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT);
      Alert.alert(t('common.done'), t('training.trainingPlanInstructionsCopied'));
    } catch {
      Alert.alert(t('common.error'), t('training.trainingPlanInstructionsCopyError'));
    } finally {
      isCopyingTemplateRef.current = false;
      setIsCopyingTemplate(false);
    }
  }, [t]);

  const handleAnalyze = useCallback(async () => {
    await analyze();
  }, [analyze]);

  const handleImport = useCallback(async () => {
    const result = await importPlan();
    if (!result.ok) {
      if (result.kind === 'busy') return;
      Alert.alert(t('common.error'), t('training.trainingPlanImportError'));
      return;
    }
    const reusedMessage =
      result.reusedTemplateCount > 0
        ? `\n${t('training.trainingPlanImportReused', { templates: result.reusedTemplateCount })}`
        : '';
    Alert.alert(
      t('common.done'),
      `${t('training.trainingPlanImportSuccess', {
        templates: result.createdTemplateIds.length,
        plans: result.createdPlanCount,
      })}${reusedMessage}`,
      [{ text: t('common.ok'), onPress: () => navigation.navigate('TrainingHome') }],
    );
  }, [importPlan, navigation, t]);

  return (
    <LinearGradient
      colors={[dynamicStyles.gradientColors[0], dynamicStyles.gradientColors[1]]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={navigation.goBack} style={styles.backButton} accessibilityRole="button">
            <ChevronLeft size={25} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.headerTitleBlock}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('training.importTrainingPlan')}</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {t('training.importTrainingPlanSubtitle')}
            </Text>
          </View>
          {Platform.OS === 'web' ? (
            <TouchableOpacity
              onPress={handleCopyTemplate}
              disabled={isCopyingTemplate}
              style={styles.copyButton}
              accessibilityRole="button"
              accessibilityLabel={t('training.copyTrainingPlanInstructions')}
              accessibilityState={{ disabled: isCopyingTemplate, busy: isCopyingTemplate }}
            >
              {isCopyingTemplate ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Copy size={18} color={colors.primary} />
              )}
              {showCopyLabel ? (
                <Text style={[styles.copyButtonText, { color: colors.primary }]}>
                  {t('training.copyTrainingPlanInstructions')}
                </Text>
              ) : null}
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <GlassCard style={[styles.editorCard, dynamicStyles.glassCard]}>
            <View style={styles.sectionHeader}>
              <Dumbbell size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('training.trainingPlanJson')}</Text>
            </View>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              {t('training.pasteTrainingPlanJson')}
            </Text>
            <TextInput
              value={rawJson}
              onChangeText={setRawJson}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textAlignVertical="top"
              style={[
                styles.jsonInput,
                { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              placeholder={TRAINING_PLAN_IMPORT_TEMPLATE}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('training.trainingPlanJson')}
            />
            {validationErrors.length > 0 && (
              <View style={styles.errorList}>
                {validationErrors.slice(0, 8).map(error => (
                  <Text key={`${error.path}-${error.code}`} style={styles.errorText}>
                    {t('training.trainingPlanValidationError', { path: error.path, message: error.message })}
                  </Text>
                ))}
              </View>
            )}
            <TouchableOpacity
              onPress={handleAnalyze}
              disabled={rawJson.trim().length === 0 || isAnalyzing || isImporting}
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary, opacity: rawJson.trim().length === 0 || isAnalyzing ? 0.45 : 1 },
              ]}
            >
              {isAnalyzing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{t('training.analyzeTrainingPlan')}</Text>
              )}
            </TouchableOpacity>
            {isAnalyzing && (
              <View style={styles.progressBlock}>
                <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                  {t('training.trainingPlanAnalyzing')}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${analysisProgress}%`, backgroundColor: colors.primary }]}
                  />
                </View>
              </View>
            )}
          </GlassCard>

          {document && (
            <GlassCard style={[styles.previewCard, dynamicStyles.glassCard]}>
              <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>{document.plan_name}</Text>
              <Text style={[styles.previewMeta, { color: colors.textSecondary }]}>
                {t('training.trainingPlanPreviewMeta', {
                  weeks: document.weeks.length,
                  weekLabel: t(
                    document.weeks.length === 1 ? 'training.trainingPlanWeek' : 'training.trainingPlanWeeks',
                  ),
                  sessions: document.weeks.flatMap(week => week.sessions).length,
                  workoutLabel: t('training.trainingPlanWorkouts'),
                })}
              </Text>
              <TouchableOpacity
                onPress={handleImport}
                disabled={!canImport}
                style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: canImport ? 1 : 0.45 }]}
              >
                {isImporting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Upload size={18} color="#fff" />
                    <Text style={styles.primaryButtonText}>{t('training.importTrainingPlanAction')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </GlassCard>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitleBlock: { flex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  headerSubtitle: { marginTop: 3, fontSize: 13 },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,122,255,0.08)',
  },
  copyButtonText: { fontSize: 12, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 140, gap: 16, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  editorCard: { padding: 20, borderRadius: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionTitle: { fontSize: 19, fontWeight: '800' },
  helperText: { marginTop: 5, marginBottom: 14, fontSize: 14 },
  jsonInput: {
    minHeight: 390,
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    fontFamily: Platform.OS === 'ios' || Platform.OS === 'web' ? 'Menlo' : undefined,
    fontSize: 13,
    lineHeight: 19,
  },
  errorList: { marginTop: 12, gap: 4 },
  errorText: { color: '#D33B42', fontSize: 12 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  progressBlock: { marginTop: 12, gap: 7 },
  progressLabel: { fontSize: 13, fontWeight: '600' },
  progressTrack: { height: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,0.18)' },
  progressFill: { height: '100%', borderRadius: 8 },
  previewCard: { padding: 20, borderRadius: 24 },
  previewTitle: { fontSize: 20, fontWeight: '800' },
  previewMeta: { marginTop: 5, fontSize: 14 },
});
