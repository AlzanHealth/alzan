import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { OnboardingScreenNavigationProp } from '../../types/navigation.types';
import { useOnboardingStyles } from '../../hooks/useOnboardingStyles';
import { useOnboarding } from '../../hooks/useOnboarding';
import { OnboardingProgress } from '../../components/OnboardingProgress';
import { OnboardingBackButton } from '../../components/OnboardingBackButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { OnboardingStep, DAILY_ACTIVITY_OPTIONS, TRAINING_FREQUENCY_OPTIONS } from '../../types/onboarding.types';
import { spacing, borderRadius, shadows } from '../../theme';
import { DailyActivity, TrainingFrequency } from '../../types/requests.types';
import { Nullable } from '../../types/common.types';
import { useTranslation } from 'react-i18next';

export const OnboardingActivity = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<OnboardingScreenNavigationProp>();
  const { styles, colors: themeColors, isDark } = useOnboardingStyles();
  const { data, updateData, saveAndNext, saving } = useOnboarding();

  const [dailyActivity, setDailyActivity] = useState<Nullable<DailyActivity>>(data.dailyActivity);
  const [trainingFrequency, setTrainingFrequency] = useState<Nullable<TrainingFrequency>>(data.trainingFrequency);

  // Step tracking (1 = NEAT, 2 = EAT)
  const [step, setStep] = useState<1 | 2>(1);

  const isStep1Valid = dailyActivity !== null;
  const isStep2Valid = trainingFrequency !== null;

  const handleContinue = useCallback(async () => {
    if (step === 1 && isStep1Valid) {
      setStep(2);
      return;
    }

    if (step === 2 && isStep2Valid) {
      const newData = { dailyActivity, trainingFrequency };
      updateData(newData);
      const success = await saveAndNext(newData);
      if (success) {
        navigation.navigate('OnboardingProfile');
      }
    }
  }, [step, isStep1Valid, isStep2Valid, dailyActivity, trainingFrequency, updateData, saveAndNext, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerContainer}>
          <OnboardingProgress currentStep={OnboardingStep.ACTIVITY} />

          {step === 1 ? (
            <>
              <Text style={styles.title}>{t('settings.dailyLife')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.activityLevelQuestion')}</Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>{t('settings.yourWorkouts')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.daysTrainingQuestion')}</Text>
            </>
          )}
        </View>

        <View style={styles.optionsGrid}>
          {step === 1
            ? DAILY_ACTIVITY_OPTIONS.map(option => {
                const isSelected = dailyActivity === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      localStyles.activityCard,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : themeColors.surface,
                        borderColor: isSelected ? themeColors.primary : themeColors.border,
                      },
                      isSelected && {
                        backgroundColor: isDark ? 'rgba(0, 122, 255, 0.20)' : 'rgba(0, 122, 255, 0.12)',
                      },
                    ]}
                    onPress={() => setDailyActivity(option.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={localStyles.activityIcon}>{option.icon}</Text>
                    <View style={localStyles.activityTextContainer}>
                      <Text
                        style={[
                          localStyles.activityLabel,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary, fontWeight: '700' },
                        ]}
                      >
                        {t(option.labelKey)}
                      </Text>
                      <Text style={[localStyles.activityDesc, { color: themeColors.textSecondary }]}>
                        {t(option.descriptionKey)}
                      </Text>
                    </View>
                    <View
                      style={[
                        localStyles.radioOuter,
                        { borderColor: isSelected ? themeColors.primary : themeColors.border },
                      ]}
                    >
                      {isSelected && (
                        <View style={[localStyles.radioInner, { backgroundColor: themeColors.primary }]} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            : TRAINING_FREQUENCY_OPTIONS.map(option => {
                const isSelected = trainingFrequency === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      localStyles.activityCard,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : themeColors.surface,
                        borderColor: isSelected ? themeColors.primary : themeColors.border,
                      },
                      isSelected && {
                        backgroundColor: isDark ? 'rgba(0, 122, 255, 0.20)' : 'rgba(0, 122, 255, 0.12)',
                      },
                    ]}
                    onPress={() => setTrainingFrequency(option.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={localStyles.activityIcon}>{option.icon}</Text>
                    <View style={localStyles.activityTextContainer}>
                      <Text
                        style={[
                          localStyles.activityLabel,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary, fontWeight: '700' },
                        ]}
                      >
                        {t(option.labelKey)}
                      </Text>
                      <Text style={[localStyles.activityDesc, { color: themeColors.textSecondary }]}>
                        {t(option.descriptionKey)}
                      </Text>
                    </View>
                    <View
                      style={[
                        localStyles.radioOuter,
                        { borderColor: isSelected ? themeColors.primary : themeColors.border },
                      ]}
                    >
                      {isSelected && (
                        <View style={[localStyles.radioInner, { backgroundColor: themeColors.primary }]} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
        </View>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <OnboardingBackButton onPress={step === 2 ? () => setStep(1) : undefined} />
        <PrimaryButton
          title={step === 1 ? t('common.next') : t('onboarding.continue')}
          onPress={handleContinue}
          loading={saving}
          disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
        />
      </View>
    </View>
  );
};

const localStyles = StyleSheet.create({
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.m,
    padding: spacing.m,
    marginBottom: spacing.s,
    borderWidth: 1,
    ...shadows.soft,
  },
  activityIcon: {
    fontSize: 28,
    marginRight: spacing.m,
  },
  activityTextContainer: {
    flex: 1,
    marginRight: spacing.s,
  },
  activityLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  activityDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
