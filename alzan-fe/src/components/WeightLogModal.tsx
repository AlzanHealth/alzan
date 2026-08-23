import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { typography, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAddWeightLog } from '../modules/health/hooks/useWeight';
import { useUnitConversion } from '../hooks/useUnitConversion';
import { BlurView } from 'expo-blur';
import { X, AlertTriangle } from 'lucide-react-native';
import { Alert } from './common/Alert';
import { useTranslation } from 'react-i18next';
import { DECIMAL_INPUT_PROPS, parseLocalizedDecimal } from '../utils/numericInput';

interface WeightLogModalProps {
  visible: boolean;
  onClose: () => void;
}

export const WeightLogModal = ({ visible, onClose }: WeightLogModalProps) => {
  const { t } = useTranslation();
  const [weight, setWeight] = useState('');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const { colors, isDark } = useTheme();
  const addWeightMutation = useAddWeightLog();
  const queryClient = useQueryClient();
  const { parseWeightToKg, units } = useUnitConversion();

  const handleSave = () => {
    const weightVal = parseLocalizedDecimal(weight);

    // Validate based on unit
    const minVal = units.weight === 'kg' ? 20 : 44;
    const maxVal = units.weight === 'kg' ? 300 : 660;

    if (weightVal === null || weightVal < minVal || weightVal > maxVal) {
      Alert.alert(t('common.error'), t('health.invalidWeightRange', { min: minVal, max: maxVal, unit: units.weight }));
      return;
    }

    // Convert to kg for storage
    const weightInKg = parseWeightToKg(weightVal);

    addWeightMutation.mutate(
      {
        weight_kg: weightInKg,
        measured_at: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          setWeight('');
          onClose();
        },
        onError: (error: unknown) => {
          const err = error as { type: string; message: string };
          // Check for duplicate day error (expected case, not a real error)
          if (err.type === 'DUPLICATE_DAY' || err.message === 'DUPLICATE_DAY') {
            setShowDuplicateModal(true);
            return;
          }
          Alert.alert(t('common.error'), t('health.saveWeightError'));
        },
      },
    );
  };

  // Dynamic styles based on theme
  const dynamicStyles = {
    card: {
      backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
      shadowColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)',
    },
    closeButton: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    },
    label: {
      color: colors.textSecondary,
    },
    input: {
      color: colors.textPrimary,
    },
    inputPlaceholder: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
    unit: {
      color: colors.textSecondary,
    },
    saveButton: {
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
    },
    disabledButton: {
      backgroundColor: isDark ? '#3A3A3C' : '#E5E5EA',
    },
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <BlurView intensity={40} style={StyleSheet.absoluteFill} tint={isDark ? 'dark' : 'light'} />

        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <View style={[styles.card, dynamicStyles.card]}>
            <TouchableOpacity onPress={onClose} style={[styles.closeButton, dynamicStyles.closeButton]}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <Text style={[styles.label, dynamicStyles.label]}>{t('common.newWeightTitle')}</Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, dynamicStyles.input]}
                value={weight}
                onChangeText={setWeight}
                placeholder="0.0"
                placeholderTextColor={dynamicStyles.inputPlaceholder}
                {...DECIMAL_INPUT_PROPS}
                autoFocus={visible}
                maxLength={5}
                selectionColor={colors.primary}
              />
              <Text style={[styles.unit, dynamicStyles.unit]}>{units.weight}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.saveButton,
                dynamicStyles.saveButton,
                (!weight || addWeightMutation.isPending) && [styles.disabledButton, dynamicStyles.disabledButton],
              ]}
              onPress={handleSave}
              disabled={!weight || addWeightMutation.isPending}
            >
              {addWeightMutation.isPending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>{t('common.saveWeight')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Duplicate Day Modal */}
      <Modal
        visible={showDuplicateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDuplicateModal(false)}
      >
        <View style={styles.duplicateModalOverlay}>
          <View style={[styles.duplicateModalContent, { backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF' }]}>
            <View style={[styles.duplicateModalIconContainer, { backgroundColor: '#F59E0B20' }]}>
              <AlertTriangle size={32} color="#F59E0B" />
            </View>
            <Text style={[styles.duplicateModalTitle, { color: colors.textPrimary }]}>{t('common.recordExists')}</Text>
            <Text style={[styles.duplicateModalMessage, { color: colors.textSecondary }]}>
              {t('common.overwriteWeightWarning')}
            </Text>
            <TouchableOpacity
              style={[styles.duplicateModalButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowDuplicateModal(false)}
            >
              <Text style={styles.duplicateModalButtonText}>{t('common.gotIt')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardView: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: spacing.l,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 28,
    padding: spacing.xl,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.m,
    right: spacing.m,
    padding: spacing.xs,
    borderRadius: 12,
  },
  label: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.m,
    textTransform: 'uppercase',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  input: {
    fontSize: 60,
    fontWeight: '700',
    minWidth: 80,
    textAlign: 'center',
    padding: 0,
    includeFontPadding: false,
  },
  unit: {
    fontSize: 24,
    fontWeight: '500',
    marginLeft: 8,
  },
  saveButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  disabledButton: {
    shadowOpacity: 0,
  },
  saveButtonText: {
    ...typography.h4,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  duplicateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  duplicateModalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  duplicateModalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  duplicateModalTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: 8,
  },
  duplicateModalMessage: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  duplicateModalButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  duplicateModalButtonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
