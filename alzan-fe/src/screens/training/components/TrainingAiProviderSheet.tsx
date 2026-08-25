import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import { AiProviderLogo } from '../../../components/icons/AiProviderLogo';
import type { TrainingAiProvider } from '../../../modules/training/services/trainingPlanAiProvider';

type TrainingAiProviderSheetProps = {
  visible: boolean;
  catalogStatus: 'loading' | 'ready' | 'error';
  catalogErrorKind: 'timeout' | 'load' | null;
  isLaunching: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSelect: (provider: TrainingAiProvider) => void;
};

const PROVIDERS: TrainingAiProvider[] = ['chatgpt', 'gemini', 'claude'];

export const TrainingAiProviderSheet = ({
  visible,
  catalogStatus,
  catalogErrorKind,
  isLaunching,
  onClose,
  onRetry,
  onSelect,
}: TrainingAiProviderSheetProps) => {
  const { t } = useTranslation();
  const { colors, styles: dynamicStyles } = useTrainingStyles();
  const providersDisabled = catalogStatus !== 'ready' || isLaunching;

  const providerName = (provider: TrainingAiProvider): string => {
    if (provider === 'chatgpt') return t('training.trainingAiChatGPT');
    if (provider === 'gemini') return t('training.trainingAiGemini');
    return t('training.trainingAiClaude');
  };
  const providerHint = (provider: TrainingAiProvider): string => {
    if (provider === 'chatgpt') return t('training.trainingAiChatGPTHint');
    if (provider === 'gemini') return t('training.trainingAiGeminiHint');
    return t('training.trainingAiClaudeHint');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, dynamicStyles.modalContent]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t('training.trainingAiSheetTitle')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {catalogStatus === 'loading'
                  ? t('training.trainingAiLoadingCatalog')
                  : catalogStatus === 'error'
                    ? t(
                        catalogErrorKind === 'timeout'
                          ? 'training.trainingAiCatalogTimeout'
                          : 'training.trainingAiCatalogLoadError',
                      )
                    : t('training.trainingAiSheetSubtitle')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <X size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {catalogStatus === 'error' ? (
            <TouchableOpacity
              onPress={onRetry}
              style={[styles.retryButton, { borderColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={t('training.trainingAiRetryCatalog')}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>{t('training.trainingAiRetryCatalog')}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.providerList}>
            {PROVIDERS.map(provider => (
              <TouchableOpacity
                key={provider}
                onPress={() => onSelect(provider)}
                disabled={providersDisabled}
                style={[styles.providerButton, { borderColor: colors.border, opacity: providersDisabled ? 0.55 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={providerName(provider)}
                accessibilityState={{ disabled: providersDisabled, busy: isLaunching }}
              >
                <AiProviderLogo provider={provider} />
                <View style={styles.providerCopy}>
                  <Text style={[styles.providerName, { color: colors.textPrimary }]}>{providerName(provider)}</Text>
                  <Text style={[styles.providerHint, { color: colors.textSecondary }]}>{providerHint(provider)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={[styles.cancelButton, { backgroundColor: dynamicStyles.secondaryButton.backgroundColor }]}
            accessibilityRole="button"
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('training.trainingAiCancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { marginTop: 6, fontSize: 14, lineHeight: 20 },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  providerList: { marginTop: 18, gap: 10 },
  retryButton: {
    minHeight: 48,
    marginTop: 16,
    borderWidth: 1.5,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 15, fontWeight: '800' },
  providerButton: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  providerCopy: { flex: 1 },
  providerName: { fontSize: 16, fontWeight: '800' },
  providerHint: { marginTop: 3, fontSize: 13 },
  cancelButton: { minHeight: 48, marginTop: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700' },
});
