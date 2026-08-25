import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Copy } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Alert } from '../../components/common/Alert';
import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import type { TranslationKey } from '../../i18n/locales/en';
import { MenuImportEditor } from '../../modules/nutrition/components/MenuImportEditor';
import { MenuImportAiProviderSheet } from '../../modules/nutrition/components/MenuImportAiProviderSheet';
import { MenuImportPreview } from '../../modules/nutrition/components/MenuImportPreview';
import { useMenuImport } from '../../modules/nutrition/hooks/useMenuImport';
import { useMenuImportAi } from '../../modules/nutrition/hooks/useMenuImportAi';
import type { MenuImportAiProvider } from '../../modules/nutrition/services/menuImportAiProvider';
import { MENU_IMPORT_CLIPBOARD_TEXT } from '../../modules/nutrition/services/menuImportTemplate';
import { useTabBarLayout } from '../../navigation/tabBarLayout';
import type { NutritionScreenNavigationProp } from '../../types/navigation.types';

type TranslationOptions = Record<string, unknown>;

const copyTextToClipboard = async (text: string): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') throw new Error('Clipboard is unavailable');

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!copied) throw new Error('Clipboard copy failed');
};

export const MenuImportScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NutritionScreenNavigationProp>();
  const [isAiSheetVisible, setIsAiSheetVisible] = useState(false);
  const { topFromScreenBottom } = useTabBarLayout();
  const { styles: dynamicStyles, colors } = useNutritionStyles();
  const {
    rawJson,
    setRawJson,
    validationErrors,
    preview,
    isAnalyzing,
    analysisProgress,
    isImporting,
    isLoading,
    requiresReanalysis,
    canImport,
    analyze,
    importMenu,
    selectIngredient,
    setConflictDecision,
    setMealType,
  } = useMenuImport();
  const { isLaunching: isLaunchingAi, isCatalogLoading: isAiCatalogLoading, launchWithAi } = useMenuImportAi();

  const translate = useCallback(
    (key: TranslationKey, options?: TranslationOptions): string => String(t(key, options)),
    [t],
  );

  const handleAnalyze = useCallback(async () => {
    const result = await analyze();
    if (result === 'error') {
      Alert.alert(
        translate('nutrition.menuImportAnalysisErrorTitle'),
        translate('nutrition.menuImportAnalysisErrorMessage'),
      );
    }
  }, [analyze, translate]);

  const handleImport = useCallback(async () => {
    const result = await importMenu();
    if (result.ok) {
      navigation.navigate('NutritionHome', { date: result.firstDate });
      Alert.alert(translate('nutrition.menuImportSuccessTitle'), translate('nutrition.menuImportSuccessMessage'));
      return;
    }

    if (result.kind === 'busy') {
      return;
    }
    if (result.kind === 'stale') {
      Alert.alert(translate('nutrition.menuImportStaleTitle'), translate('nutrition.menuImportStaleMessage'));
      return;
    }
    Alert.alert(translate('nutrition.menuImportErrorTitle'), translate('nutrition.menuImportErrorMessage'));
  }, [importMenu, navigation, translate]);

  const handleAnalyzePress = useCallback(() => {
    void handleAnalyze();
  }, [handleAnalyze]);

  const handleImportPress = useCallback(() => {
    void handleImport();
  }, [handleImport]);

  const handleCopyTemplate = useCallback(async () => {
    if (Platform.OS !== 'web') return;

    try {
      await copyTextToClipboard(MENU_IMPORT_CLIPBOARD_TEXT);
      Alert.alert(translate('common.done'), translate('nutrition.menuImportTemplateCopied'));
    } catch {
      Alert.alert(translate('common.error'), translate('nutrition.menuImportTemplateCopyError'));
    }
  }, [translate]);

  const handleAiProvider = useCallback(
    async (provider: MenuImportAiProvider) => {
      const result = await launchWithAi(provider);
      if (result.ok) {
        setIsAiSheetVisible(false);
        return;
      }

      const messageKey: TranslationKey =
        result.kind === 'catalog-error'
          ? 'nutrition.menuImportAiCatalogError'
          : result.kind === 'clipboard-error'
            ? 'nutrition.menuImportAiClipboardError'
            : 'nutrition.menuImportAiOpenError';
      Alert.alert(translate('common.error'), translate(messageKey));
    },
    [launchWithAi, translate],
  );

  const handleOpenWithAi = useCallback(() => {
    setIsAiSheetVisible(true);
  }, []);

  const editor = useMemo(
    () => (
      <MenuImportEditor
        rawJson={rawJson}
        errors={validationErrors}
        isAnalyzing={isAnalyzing}
        analysisProgress={analysisProgress}
        isInputDisabled={isLoading}
        isAnalyzeDisabled={isLoading || isLaunchingAi || rawJson.length === 0}
        isAiLaunching={isLaunchingAi}
        isAiDisabled={isLoading || isLaunchingAi}
        onChangeText={setRawJson}
        onAnalyze={handleAnalyzePress}
        onOpenWithAi={handleOpenWithAi}
        translate={translate}
      />
    ),
    [
      analysisProgress,
      handleAnalyzePress,
      handleOpenWithAi,
      isAnalyzing,
      isLaunchingAi,
      isLoading,
      rawJson,
      setRawJson,
      translate,
      validationErrors,
    ],
  );

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={navigation.goBack}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={translate('nutrition.menuImportBackAccessibility')}
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {translate('nutrition.menuImportTitle')}
          </Text>
          <View style={styles.headerActions}>
            {Platform.OS === 'web' && (
              <TouchableOpacity
                style={[
                  styles.headerTemplateButton,
                  { borderColor: colors.border, backgroundColor: colors.surfaceSolid },
                ]}
                onPress={() => void handleCopyTemplate()}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={translate('nutrition.menuImportCopyTemplateAccessibility')}
              >
                <Copy size={17} color={colors.primary} strokeWidth={2.2} />
                <Text style={[styles.headerTemplateText, { color: colors.primary }]}>
                  {translate('nutrition.menuImportCopyTemplateShort')}
                </Text>
              </TouchableOpacity>
            )}
            {preview !== null ? (
              <TouchableOpacity
                style={[
                  styles.headerImportButton,
                  { backgroundColor: canImport ? colors.primary : colors.disabledButton },
                ]}
                onPress={handleImportPress}
                disabled={!canImport}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={translate('nutrition.menuImportSubmitAccessibility')}
                accessibilityState={{ busy: isImporting, disabled: !canImport }}
              >
                {isImporting ? <ActivityIndicator color={colors.white} /> : null}
                <Text style={[styles.headerImportText, { color: colors.white }]}>
                  {translate('nutrition.menuImportSubmitShort')}
                </Text>
              </TouchableOpacity>
            ) : null}
            {preview === null && Platform.OS !== 'web' ? <View style={styles.headerSpacer} /> : null}
          </View>
        </View>

        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <MenuImportPreview
            preview={preview}
            editor={editor}
            requiresReanalysis={requiresReanalysis}
            canImport={canImport}
            isImporting={isImporting}
            bottomInset={topFromScreenBottom}
            onImport={handleImportPress}
            onSelectIngredient={selectIngredient}
            onSetConflictDecision={setConflictDecision}
            onSetMealType={setMealType}
            translate={translate}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
      <MenuImportAiProviderSheet
        visible={isAiSheetVisible}
        isLoading={isLaunchingAi || isAiCatalogLoading}
        onClose={() => setIsAiSheetVisible(false)}
        onSelect={provider => void handleAiProvider(provider)}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    textAlign: 'center',
  },
  headerActions: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  headerImportButton: {
    minWidth: 76,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerImportText: {
    fontSize: 13,
    fontWeight: '700',
  },
  headerTemplateButton: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerTemplateText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
