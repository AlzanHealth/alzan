import React, { memo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';

import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import type { TranslationKey } from '../../../i18n/locales/en';
import { borderRadius } from '../../../theme';
import {
  MENU_IMPORT_MAX_TEXT_LENGTH,
  type MenuImportValidationError,
  type MenuImportValidationErrorCode,
} from '../services/menuImportContract';
import type { MenuImportAnalysisProgress } from '../hooks/useMenuImport';

type Translate = (key: TranslationKey, options?: Record<string, unknown>) => string;

const MENU_IMPORT_VALIDATION_ERROR_KEYS: Record<MenuImportValidationErrorCode, TranslationKey> = {
  invalid_json: 'nutrition.menuImportValidation.invalidJson',
  text_too_long: 'nutrition.menuImportValidation.textTooLong',
  invalid_type: 'nutrition.menuImportValidation.invalidType',
  missing_field: 'nutrition.menuImportValidation.missingField',
  unknown_property: 'nutrition.menuImportValidation.unknownProperty',
  unsupported_format: 'nutrition.menuImportValidation.unsupportedFormat',
  unsupported_version: 'nutrition.menuImportValidation.unsupportedVersion',
  invalid_length: 'nutrition.menuImportValidation.invalidLength',
  invalid_date: 'nutrition.menuImportValidation.invalidDate',
  duplicate_date: 'nutrition.menuImportValidation.duplicateDate',
  invalid_weekday: 'nutrition.menuImportValidation.invalidWeekday',
  weekday_mismatch: 'nutrition.menuImportValidation.weekdayMismatch',
  invalid_meal_type: 'nutrition.menuImportValidation.invalidMealType',
  out_of_range: 'nutrition.menuImportValidation.outOfRange',
  too_many_ingredients: 'nutrition.menuImportValidation.tooManyIngredients',
  too_many_unique_ingredients: 'nutrition.menuImportValidation.tooManyUniqueIngredients',
};

interface MenuImportEditorProps {
  rawJson: string;
  errors: MenuImportValidationError[];
  isAnalyzing: boolean;
  analysisProgress: MenuImportAnalysisProgress | null;
  isInputDisabled: boolean;
  isAnalyzeDisabled: boolean;
  isAiLaunching: boolean;
  isAiDisabled: boolean;
  onChangeText: (value: string) => void;
  onAnalyze: () => void;
  onOpenWithAi: () => void;
  translate: Translate;
}

export const MenuImportEditor = memo(function MenuImportEditor({
  rawJson,
  errors,
  isAnalyzing,
  analysisProgress,
  isInputDisabled,
  isAnalyzeDisabled,
  isAiLaunching,
  isAiDisabled,
  onChangeText,
  onAnalyze,
  onOpenWithAi,
  translate,
}: MenuImportEditorProps) {
  const { styles: dynamicStyles, colors } = useNutritionStyles();

  return (
    <View style={[styles.card, dynamicStyles.card]}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>{translate('nutrition.menuImportEditorLabel')}</Text>
      <Text style={[styles.help, { color: colors.textSecondary }]}>{translate('nutrition.menuImportEditorHelp')}</Text>

      <TextInput
        value={rawJson}
        onChangeText={onChangeText}
        style={[styles.input, dynamicStyles.input]}
        placeholder={translate('nutrition.menuImportEditorPlaceholder')}
        placeholderTextColor={dynamicStyles.inputPlaceholder}
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={MENU_IMPORT_MAX_TEXT_LENGTH}
        editable={!isInputDisabled}
        accessibilityLabel={translate('nutrition.menuImportEditorAccessibility')}
      />

      {errors.length > 0 ? (
        <View style={styles.errors} accessibilityLiveRegion="polite">
          <Text style={[styles.errorTitle, { color: colors.danger }]}>
            {translate('nutrition.menuImportValidationTitle')}
          </Text>
          {errors.map((error, index) => (
            <Text key={`${error.path}-${error.code}-${index}`} style={[styles.errorText, { color: colors.danger }]}>
              {error.path}: {translate(MENU_IMPORT_VALIDATION_ERROR_KEYS[error.code])}
            </Text>
          ))}
        </View>
      ) : null}

      {isAnalyzing ? (
        <View
          style={[styles.analyzeButton, styles.progressButton, { backgroundColor: colors.disabledButton }]}
          accessibilityRole="progressbar"
          accessibilityLabel={translate('nutrition.menuImportAnalyzeAccessibility')}
          accessibilityValue={{
            min: 0,
            max: 100,
            now: analysisProgress?.percentage ?? 0,
          }}
        >
          <View
            style={[
              styles.progressButtonFill,
              {
                width: `${Math.max(3, Math.min(100, analysisProgress?.percentage ?? 0))}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
          <View style={styles.progressButtonContent}>
            <ActivityIndicator color={colors.white} />
            <Text style={[styles.analyzeButtonText, styles.progressButtonLabel, { color: colors.white }]}>
              {analysisProgress?.phase === 'preparing'
                ? translate('nutrition.menuImportProgressPreparing')
                : translate('nutrition.menuImportProgressIngredients', {
                    completed: analysisProgress?.completed ?? 0,
                    total: analysisProgress?.total ?? 0,
                  })}
            </Text>
            <Text style={[styles.analyzeButtonText, { color: colors.white }]}>
              {analysisProgress?.percentage ?? 0}%
            </Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.analyzeButton,
            { backgroundColor: isAnalyzeDisabled ? colors.disabledButton : colors.primary },
          ]}
          onPress={onAnalyze}
          disabled={isAnalyzeDisabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={translate('nutrition.menuImportAnalyzeAccessibility')}
          accessibilityState={{ disabled: isAnalyzeDisabled }}
        >
          <Text style={[styles.analyzeButtonText, { color: colors.white }]}>
            {translate('nutrition.menuImportAnalyze')}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[
          styles.aiButton,
          {
            borderColor: isAiDisabled ? colors.disabledButton : colors.primary,
            backgroundColor: colors.background,
          },
        ]}
        onPress={onOpenWithAi}
        disabled={isAiDisabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={translate('nutrition.menuImportOpenWithAiAccessibility')}
        accessibilityState={{ busy: isAiLaunching, disabled: isAiDisabled }}
      >
        {isAiLaunching ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Sparkles size={19} color={isAiDisabled ? colors.textSecondary : colors.primary} strokeWidth={2.2} />
        )}
        <Text style={[styles.aiButtonText, { color: isAiDisabled ? colors.textSecondary : colors.primary }]}>
          {translate(isAiLaunching ? 'nutrition.menuImportAiLoadingCatalog' : 'nutrition.menuImportOpenWithAi')}
        </Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.l,
    padding: 16,
  },
  label: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
  },
  help: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    minHeight: 220,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 13,
    lineHeight: 19,
  },
  errors: {
    gap: 4,
    marginTop: 12,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  analyzeButton: {
    minHeight: 50,
    marginTop: 16,
    borderRadius: borderRadius.m,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  analyzeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  aiButton: {
    minHeight: 48,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  aiButtonText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressButton: {
    overflow: 'hidden',
    position: 'relative',
  },
  progressButtonFill: {
    ...StyleSheet.absoluteFillObject,
  },
  progressButtonContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  progressButtonLabel: {
    flex: 1,
    textAlign: 'left',
  },
});
