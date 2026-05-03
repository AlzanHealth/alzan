import React from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { colors, typography } from '../../../theme';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { HealthPdfExportController, parseHealthExportWebDateInput } from '../hooks/useHealthPdfExport';

type HealthExportModalProps = {
  controller: HealthPdfExportController;
};

export const HealthExportModal = ({ controller }: HealthExportModalProps) => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useHealthStyles();

  return (
    <Modal visible={controller.isModalVisible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContent, dynamicStyles.modalContent, Platform.OS === 'web' && styles.webModalContent]}
        >
          <Text style={[styles.modalTitle, dynamicStyles.title]}>{t('health.exportHealthHistory')}</Text>
          <Text style={[styles.modalSubtitle, dynamicStyles.subtitle]}>{t('health.generatePdfHistory')}</Text>

          <View style={styles.exportDateRow}>
            <View style={styles.exportDateField}>
              <Text style={[styles.label, dynamicStyles.sublabel]}>{t('nutrition.startDate')}</Text>
              {Platform.OS === 'web' ? (
                <TextInput
                  style={[styles.webDateInput, dynamicStyles.input]}
                  value={controller.startInput}
                  onChangeText={value => {
                    controller.setStartInput(value);
                    const parsed = parseHealthExportWebDateInput(value);
                    if (!parsed || parsed > new Date()) return;
                    controller.setStartDate(parsed);
                  }}
                  onBlur={() => {
                    if (!parseHealthExportWebDateInput(controller.startInput)) {
                      controller.setStartInput(format(controller.startDate, 'yyyy-MM-dd'));
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
                    const parsed = parseHealthExportWebDateInput(value);
                    if (!parsed || parsed > new Date()) return;
                    controller.setEndDate(parsed);
                  }}
                  onBlur={() => {
                    if (!parseHealthExportWebDateInput(controller.endInput)) {
                      controller.setEndInput(format(controller.endDate, 'yyyy-MM-dd'));
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
              <Text style={[styles.modalBtnTextCancel, dynamicStyles.subtitle]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={controller.exportPdf}
              style={[
                styles.modalBtnConfirm,
                { backgroundColor: themeColors.primary },
                controller.isExportDisabled && { opacity: 0.45 },
              ]}
              disabled={controller.isExportDisabled}
            >
              {controller.isExporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalBtnTextConfirm}>{t('training.exportPdf')}</Text>
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
    padding: 24,
  },
  modalContent: {
    borderRadius: 24,
    padding: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  webModalContent: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: 20,
  },
  exportDateRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  exportDateField: {
    flex: 1,
  },
  label: {
    ...typography.caption,
    fontWeight: '700',
    marginBottom: 8,
  },
  webDateInput: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
  },
  exportRangeError: {
    ...typography.caption,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 18,
  },
  modalBtnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalBtnConfirm: {
    minWidth: 132,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalBtnTextCancel: {
    ...typography.button,
  },
  modalBtnTextConfirm: {
    ...typography.button,
    color: colors.white,
  },
});
