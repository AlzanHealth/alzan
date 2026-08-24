import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { AiProviderLogo } from '../../../components/icons/AiProviderLogo';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import type { MenuImportAiProvider } from '../services/menuImportAiProvider';

type MenuImportAiProviderSheetProps = {
  visible: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSelect: (provider: MenuImportAiProvider) => void;
};

const PROVIDERS: MenuImportAiProvider[] = ['chatgpt', 'gemini', 'claude'];

export const MenuImportAiProviderSheet = ({
  visible,
  isLoading,
  onClose,
  onSelect,
}: MenuImportAiProviderSheetProps) => {
  const { t } = useTranslation();
  const { colors, styles: dynamicStyles } = useNutritionStyles();

  const providerName = (provider: MenuImportAiProvider): string => {
    if (provider === 'chatgpt') return t('nutrition.menuImportAiChatGPT');
    if (provider === 'gemini') return t('nutrition.menuImportAiGemini');
    return t('nutrition.menuImportAiClaude');
  };
  const providerHint = (provider: MenuImportAiProvider): string => {
    if (provider === 'chatgpt') return t('nutrition.menuImportAiChatGPTHint');
    if (provider === 'gemini') return t('nutrition.menuImportAiGeminiHint');
    return t('nutrition.menuImportAiClaudeHint');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={isLoading ? undefined : onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={isLoading ? undefined : onClose} />
        <View style={[styles.sheet, dynamicStyles.modalContent]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t('nutrition.menuImportAiSheetTitle')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {isLoading ? t('nutrition.menuImportAiLoadingCatalog') : t('nutrition.menuImportAiSheetSubtitle')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isLoading}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <X size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.providerList}>
            {PROVIDERS.map(provider => (
              <TouchableOpacity
                key={provider}
                onPress={() => onSelect(provider)}
                disabled={isLoading}
                style={[styles.providerButton, { borderColor: colors.border, opacity: isLoading ? 0.55 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={providerName(provider)}
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
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
            disabled={isLoading}
            style={[styles.cancelButton, { backgroundColor: dynamicStyles.secondaryButton.backgroundColor }]}
            accessibilityRole="button"
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
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
