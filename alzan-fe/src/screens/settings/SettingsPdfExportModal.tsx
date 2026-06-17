import React from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { formatSettingsPdfExportDate } from './settingsPdfExportRange';
import type { SettingsCombinedPdfExportController } from './useSettingsCombinedPdfExport';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';

type SettingsPdfExportModalProps = {
  controller: SettingsCombinedPdfExportController;
};

export const SettingsPdfExportModal = ({ controller }: SettingsPdfExportModalProps) => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useSettingsStyles();

  return (
    <Modal visible={controller.isModalVisible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContent, dynamicStyles.modalContent, Platform.OS === 'web' && styles.webModalContent]}
        >
          <Text style={[styles.modalTitle, dynamicStyles.label]}>{t('settings.exportCombinedPdfModalTitle')}</Text>
          <Text style={[styles.modalSubtitle, dynamicStyles.sublabel]}>
            {t('settings.exportCombinedPdfModalSubtitle')}
          </Text>

          <View style={styles.exportDateRow}>
            <View style={styles.exportDateField}>
              <Text style={[styles.label, dynamicStyles.sublabel]}>{t('nutrition.startDate')}</Text>
              {Platform.OS === 'web' ? (
                <TextInput
                  style={[styles.webDateInput, dynamicStyles.input]}
                  value={controller.startInput}
                  onChangeText={value => {
                    controller.setStartInput(value);
                    const parsed = controller.parseDateInput(value);
                    if (!parsed || parsed > new Date()) return;
                    controller.setStartDate(parsed);
                  }}
                  onBlur={() => {
                    if (!controller.parseDateInput(controller.startInput)) {
                      controller.setStartInput(formatSettingsPdfExportDate(controller.startDate));
                    }
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={themeColors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              ) : (
                <DateTimePicker
                  value={controller.startDate}
                  mode="date"
                  display="default"
                  maximumDate={new Date()}
                  themeVariant={isDark ? 'dark' : 'light'}
                  onChange={(_, date) => {
                    if (date) controller.setStartDate(date);
                  }}
                />
              )}
            </View>

            <View style={styles.exportDateField}>
              <Text style={[styles.label, dynamicStyles.sublabel]}>{t('nutrition.endDate')}</Text>
              {Platform.OS === 'web' ? (
                <TextInput
                  style={[styles.webDateInput, dynamicStyles.input]}
                  value={controller.endInput}
                  onChangeText={value => {
                    controller.setEndInput(value);
                    const parsed = controller.parseDateInput(value);
                    if (!parsed || parsed > new Date()) return;
                    controller.setEndDate(parsed);
                  }}
                  onBlur={() => {
                    if (!controller.parseDateInput(controller.endInput)) {
                      controller.setEndInput(formatSettingsPdfExportDate(controller.endDate));
                    }
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={themeColors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              ) : (
                <DateTimePicker
                  value={controller.endDate}
                  mode="date"
                  display="default"
                  maximumDate={new Date()}
                  themeVariant={isDark ? 'dark' : 'light'}
                  onChange={(_, date) => {
                    if (date) controller.setEndDate(date);
                  }}
                />
              )}
            </View>
          </View>

          {controller.rangeErrorMessage ? (
            <Text style={[styles.exportRangeError, { color: themeColors.danger }]}>{controller.rangeErrorMessage}</Text>
          ) : null}

          <View style={styles.modalButtons}>
            <TouchableOpacity onPress={controller.closeModal} style={styles.modalBtnCancel}>
              <Text style={[styles.modalBtnTextCancel, dynamicStyles.sublabel]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={controller.exportCombinedPdf}
              style={[
                styles.modalBtnConfirm,
                { backgroundColor: themeColors.primary },
                controller.isExportDisabled && { opacity: 0.45 },
              ]}
              disabled={controller.isExportDisabled}
            >
              {controller.isExporting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.modalBtnTextConfirm}>{t('settings.exportCombinedPdf')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.l,
  },
  modalContent: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    ...shadows.soft,
  },
  webModalContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  modalTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.s,
    fontWeight: '700',
  },
  modalSubtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.l,
    lineHeight: 22,
  },
  exportDateRow: {
    flexDirection: 'row',
    gap: spacing.m,
    marginBottom: spacing.s,
  },
  exportDateField: {
    flex: 1,
  },
  label: {
    ...typography.caption,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  webDateInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: borderRadius.s,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    fontSize: 16,
  },
  exportRangeError: {
    ...typography.caption,
    fontWeight: '700',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
    gap: spacing.m,
  },
  modalBtnCancel: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
  },
  modalBtnTextCancel: {
    ...typography.button,
  },
  modalBtnConfirm: {
    minHeight: 48,
    minWidth: 148,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
  },
  modalBtnTextConfirm: {
    ...typography.button,
    color: colors.white,
  },
});
