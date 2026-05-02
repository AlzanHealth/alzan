import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { OnboardingScreenNavigationProp } from '../../types/navigation.types';
import { useOnboardingStyles } from '../../hooks/useOnboardingStyles';
import { useOnboarding } from '../../hooks/useOnboarding';
import { OnboardingProgress } from '../../components/OnboardingProgress';
import { OnboardingBackButton } from '../../components/OnboardingBackButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { OnboardingStep, GOAL_OPTIONS, GOAL_DESCRIPTIONS } from '../../types/onboarding.types';
import { Info, X } from 'lucide-react-native';
import { spacing, borderRadius, shadows } from '../../theme';
import { PrimaryGoalMode } from '../../types/requests.types';
import { useTranslation } from 'react-i18next';

export const OnboardingGoal = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<OnboardingScreenNavigationProp>();
  const { styles, colors: themeColors, isDark } = useOnboardingStyles();
  const { data, updateData, saveAndNext, saving } = useOnboarding();

  const [selectedGoal, setSelectedGoal] = useState<PrimaryGoalMode | null>(data.primaryGoal);
  const [infoModalGoal, setInfoModalGoal] = useState<PrimaryGoalMode | null>(null);

  const isValid = selectedGoal !== null;

  const handleContinue = useCallback(async () => {
    if (!selectedGoal) return;
    const newData = { primaryGoal: selectedGoal };
    updateData(newData);
    const success = await saveAndNext(newData);
    if (success) {
      navigation.navigate('OnboardingPhysical');
    }
  }, [selectedGoal, updateData, saveAndNext, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerContainer}>
          <OnboardingProgress currentStep={OnboardingStep.GOAL} />
          <Text style={styles.title}>{t('onboarding.yourGoal')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.mainGoalQuestion')}</Text>
        </View>

        <View style={styles.optionsGrid}>
          {GOAL_OPTIONS.map(option => {
            const isSelected = selectedGoal === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                onPress={() => setSelectedGoal(option.value)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionIcon}>{option.icon}</Text>
                <View style={[styles.optionTextContainer, { flex: 1 }]}>
                  <Text style={styles.optionTitle}>{t(option.labelKey)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setInfoModalGoal(option.value)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ marginRight: 8 }}
                >
                  <Info size={18} color={themeColors.textSecondary} />
                </TouchableOpacity>
                <View style={[styles.optionCheck, isSelected && styles.optionCheckSelected]}>
                  {isSelected && <Text style={{ color: '#FFFFFF', fontSize: 14 }}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <OnboardingBackButton />
        <PrimaryButton title={t('onboarding.continue')} onPress={handleContinue} loading={saving} disabled={!isValid} />
      </View>

      {/* Goal Info Modal */}
      <Modal
        visible={infoModalGoal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalGoal(null)}
      >
        <TouchableOpacity style={localStyles.modalOverlay} activeOpacity={1} onPress={() => setInfoModalGoal(null)}>
          <View
            style={[
              localStyles.infoModalContent,
              { backgroundColor: isDark ? 'rgba(28, 28, 30, 0.96)' : themeColors.surface },
            ]}
          >
            {infoModalGoal && (
              <>
                {(() => {
                  const goalInfo = GOAL_DESCRIPTIONS[infoModalGoal];
                  return (
                    <>
                      <View style={localStyles.infoModalHeader}>
                        <Text style={{ fontSize: 32 }}>{goalInfo.icon}</Text>
                        <Text style={[localStyles.infoModalTitle, { color: themeColors.textPrimary }]}>
                          {t(goalInfo.titleKey)}
                        </Text>
                        <TouchableOpacity onPress={() => setInfoModalGoal(null)} style={localStyles.infoModalClose}>
                          <X size={20} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                      <Text style={[localStyles.infoModalShort, { color: themeColors.primary }]}>
                        {t(goalInfo.shortDescriptionKey)}
                      </Text>
                      <Text style={[localStyles.infoModalLong, { color: themeColors.textSecondary }]}>
                        {t(goalInfo.longDescriptionKey)}
                      </Text>
                    </>
                  );
                })()}
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const localStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
  },
  infoModalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: borderRadius.l,
    padding: spacing.l,
    ...shadows.soft,
  },
  infoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.m,
    gap: spacing.s,
  },
  infoModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  infoModalClose: {
    padding: spacing.xs,
  },
  infoModalShort: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.s,
  },
  infoModalLong: {
    fontSize: 14,
    lineHeight: 20,
  },
});
