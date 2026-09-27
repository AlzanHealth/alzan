import React, { useCallback } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { OnboardingScreenNavigationProp } from '../../types/navigation.types';
import { useOnboardingStyles } from '../../hooks/useOnboardingStyles';
import { useOnboarding } from '../../hooks/useOnboarding';
import { OnboardingProgress } from '../../components/OnboardingProgress';
import { OnboardingBackButton } from '../../components/OnboardingBackButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { OnboardingStep } from '../../types/onboarding.types';
import { useTranslation } from 'react-i18next';

export const OnboardingHealth = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<OnboardingScreenNavigationProp>();
  const { styles } = useOnboardingStyles();
  const { saveAndNext, skip, saving } = useOnboarding();

  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const healthPlatform = isIOS ? 'Apple Health' : 'Google Health Connect';
  const healthDescription = isWeb
    ? t('onboarding.healthDescriptionWeb')
    : isIOS
      ? t('onboarding.healthDescriptionApple')
      : t('onboarding.healthDescriptionAndroid');

  useCallback(async () => {
    // Coming Soon - just proceed to next
    const success = await saveAndNext();
    if (success) {
      navigation.navigate('OnboardingConsent');
    }
  }, [saveAndNext, navigation]);

  const handleSkip = useCallback(async () => {
    const success = await skip();
    if (success) {
      navigation.navigate('OnboardingConsent');
    }
  }, [skip, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerContainer}>
          <OnboardingProgress currentStep={OnboardingStep.HEALTH} />
          <Text style={styles.title}>{t('onboarding.systemHealth')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.healthSyncPrompt')}</Text>
        </View>

        <View style={styles.healthCard}>
          {isIOS ? (
            <Text style={{ fontSize: 60, marginBottom: 20 }}>❤️</Text>
          ) : (
            <Text style={{ fontSize: 60, marginBottom: 20 }}>💚</Text>
          )}

          <Text style={styles.healthTitle}>{isWeb ? t('onboarding.healthPlatformWeb') : healthPlatform}</Text>
          <Text style={styles.healthDescription}>{healthDescription}</Text>

          {isWeb && (
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>{t('alzan.comingSoon')}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.helperText, { textAlign: 'center', marginTop: 24 }]}>
          {t('onboarding.healthAccountNote')}
          {'>'}
          {t('onboarding.integrations')}
        </Text>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <OnboardingBackButton />
        <PrimaryButton title={t('onboarding.later')} onPress={handleSkip} loading={saving} />
      </View>
    </View>
  );
};
