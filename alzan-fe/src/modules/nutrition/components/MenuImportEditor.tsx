import React, { memo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import type { TranslationKey } from '../../../i18n/locales/en';
import { borderRadius } from '../../../theme';
import {
  MENU_IMPORT_MAX_TEXT_LENGTH,
  type MenuImportValidationError,
  type MenuImportValidationErrorCode,
} from '../services/menuImportContract';

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
  invalid_meal_type: 'nutrition.menuImportValidation.invalidMealType',
  out_of_range: 'nutrition.menuImportValidation.outOfRange',
  too_many_ingredients: 'nutrition.menuImportValidation.tooManyIngredients',
};

interface MenuImportEditorProps {
  rawJson: string;
  errors: MenuImportValidationError[];
  isAnalyzing: boolean;
  isInputDisabled: boolean;
  isAnalyzeDisabled: boolean;
  onChangeText: (value: string) => void;
  onAnalyze: () => void;
  translate: Translate;
}

export const MenuImportEditor = memo(function MenuImportEditor({
  rawJson,
  errors,
  isAnalyzing,
  isInputDisabled,
  isAnalyzeDisabled,
  onChangeText,
  onAnalyze,
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

      <TouchableOpacity
        style={[styles.analyzeButton, { backgroundColor: isAnalyzeDisabled ? colors.disabledButton : colors.primary }]}
        onPress={onAnalyze}
        disabled={isAnalyzeDisabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={translate('nutrition.menuImportAnalyzeAccessibility')}
        accessibilityState={{ busy: isAnalyzing, disabled: isAnalyzeDisabled }}
      >
        {isAnalyzing ? <ActivityIndicator color={colors.white} /> : null}
        <Text style={[styles.analyzeButtonText, { color: colors.white }]}>
          {translate(isAnalyzing ? 'nutrition.menuImportAnalyzing' : 'nutrition.menuImportAnalyze')}
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
});
