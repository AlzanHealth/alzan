import React, { useCallback, useMemo } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Alert } from '../../components/common/Alert';
import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import type { TranslationKey } from '../../i18n/locales/en';
import { MenuImportEditor } from '../../modules/nutrition/components/MenuImportEditor';
import { MenuImportPreview } from '../../modules/nutrition/components/MenuImportPreview';
import { useMenuImport } from '../../modules/nutrition/hooks/useMenuImport';
import type { NutritionScreenNavigationProp } from '../../types/navigation.types';

type TranslationOptions = Record<string, unknown>;

export const MenuImportScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NutritionScreenNavigationProp>();
  const tabBarHeight = useBottomTabBarHeight();
  const { styles: dynamicStyles, colors } = useNutritionStyles();
  const {
    rawJson,
    setRawJson,
    validationErrors,
    preview,
    isAnalyzing,
    isImporting,
    isLoading,
    requiresReanalysis,
    canImport,
    analyze,
    importMenu,
    selectIngredient,
    setConflictDecision,
  } = useMenuImport();

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

  const editor = useMemo(
    () => (
      <MenuImportEditor
        rawJson={rawJson}
        errors={validationErrors}
        isAnalyzing={isAnalyzing}
        isInputDisabled={isLoading}
        isAnalyzeDisabled={isLoading || rawJson.length === 0}
        onChangeText={setRawJson}
        onAnalyze={handleAnalyzePress}
        translate={translate}
      />
    ),
    [handleAnalyzePress, isAnalyzing, isLoading, rawJson, setRawJson, translate, validationErrors],
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
          <View style={styles.headerSpacer} />
        </View>

        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <MenuImportPreview
            preview={preview}
            editor={editor}
            requiresReanalysis={requiresReanalysis}
            canImport={canImport}
            isImporting={isImporting}
            bottomInset={tabBarHeight}
            onImport={handleImportPress}
            onSelectIngredient={selectIngredient}
            onSetConflictDecision={setConflictDecision}
            translate={translate}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  headerSpacer: {
    width: 44,
    height: 44,
  },
});
