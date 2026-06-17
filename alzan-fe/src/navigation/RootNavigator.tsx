import React, { useEffect, useState } from 'react';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { AuthScreen } from '../screens/auth/AuthScreen';
import { TabNavigator } from './TabNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { supabase } from '../lib/supabaseClient';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '../theme';
import { TOTAL_ONBOARDING_STEPS } from '../types/onboarding.types';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { SignUpEmailScreen } from '../screens/auth/SignUpEmailScreen';
import { SignUpPasswordScreen } from '../screens/auth/SignUpPasswordScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { VerifyEmailScreen } from '../screens/auth/VerifyEmailScreen';
import { RootStackParamList } from '../types/navigation.types';
import { WeightAdd } from '../modules/health/screens/WeightAdd';
import { StepsAdd } from '../modules/health/screens/StepsAdd';
import { UserProfileScreen } from '../screens/alzan/UserProfileScreen';
import { useTranslation } from 'react-i18next';

const Stack = createStackNavigator<RootStackParamList>();
export const navigationRef = createNavigationContainerRef();

// Map onboarding step number to screen name
const STEP_TO_SCREEN: Record<number, string> = {
  1: 'OnboardingIdentity',
  2: 'OnboardingMetrics',
  3: 'OnboardingPhysical',
  4: 'OnboardingActivity',
  5: 'OnboardingProfile',
  6: 'OnboardingUnits',
  7: 'OnboardingHealth',
  8: 'OnboardingConsent',
  9: 'OnboardingComplete',
};

export const RootNavigator = () => {
  const { t } = useTranslation();
  const { session, user, loading: authLoading } = useAuth();
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // Check onboarding status when user logs in
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user?.id) {
        setCheckingOnboarding(false);
        setOnboardingStep(null);
        return;
      }

      try {
        const { data, error } = await supabase.from('users').select('onboarding_step').eq('id', user.id).single();

        if (error) {
          console.error('[RootNavigator] Error checking onboarding:', error);
          setOnboardingStep(TOTAL_ONBOARDING_STEPS + 1); // Assume complete on error
        } else {
          const step = data?.onboarding_step ?? 0;
          console.log('[RootNavigator] Onboarding step:', step);
          setOnboardingStep(step);
        }
      } catch (error) {
        console.error('[RootNavigator] Error:', error);
        setOnboardingStep(TOTAL_ONBOARDING_STEPS + 1);
      } finally {
        setCheckingOnboarding(false);
      }
    };

    if (session) {
      checkOnboardingStatus();
    } else {
      setCheckingOnboarding(false);
      setOnboardingStep(null);
    }
  }, [session, user?.id]);

  // Show loading while checking auth or onboarding
  if (authLoading || (session && checkingOnboarding)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Determine if user needs onboarding
  const needsOnboarding = session && onboardingStep !== null && onboardingStep <= TOTAL_ONBOARDING_STEPS;

  // Get initial onboarding screen based on saved step
  const getInitialOnboardingRoute = () => {
    if (!onboardingStep || onboardingStep <= 0) return 'OnboardingLanguage';
    if (onboardingStep > TOTAL_ONBOARDING_STEPS) return 'OnboardingComplete';
    return STEP_TO_SCREEN[onboardingStep] || 'OnboardingIdentity';
  };

  console.log(
    '[RootNavigator] Render. Session:',
    session ? 'Active' : 'Null',
    'OnboardingStep:',
    onboardingStep,
    'NeedsOnboarding:',
    needsOnboarding,
  );

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{ headerShown: false, cardStyle: { flex: 1 } }}
        key={session ? (needsOnboarding ? 'onboarding' : 'user') : 'guest'}
      >
        {!session ? (
          // Auth Stack (not logged in)
          <>
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen
              name="SignUpEmail"
              component={SignUpEmailScreen}
              options={{
                headerShown: true,
                title: t('auth.signUp'),
                headerTintColor: colors.textPrimary,
                headerBackTitle: ' ',
                headerShadowVisible: false,
                headerStyle: {
                  backgroundColor: colors.background,
                  shadowOpacity: 0,
                  elevation: 0,
                  borderBottomWidth: 0,
                },
                headerTitleStyle: {
                  fontWeight: '600',
                  fontSize: 17,
                  color: colors.textPrimary,
                },
              }}
            />

            <Stack.Screen
              name="SignUpPassword"
              component={SignUpPasswordScreen}
              options={{
                headerShown: true,
                title: t('auth.signUp'),
                headerTintColor: colors.textPrimary,
                headerBackTitle: ' ', // Hide back text
                headerShadowVisible: false, // Remove shadow/line on iOS/Android
                headerStyle: {
                  backgroundColor: colors.background,
                  shadowOpacity: 0, // Extra safety for iOS
                  elevation: 0, // Extra safety for Android
                  borderBottomWidth: 0,
                },
                headerTitleStyle: {
                  fontWeight: '600',
                  fontSize: 17,
                  color: colors.textPrimary,
                },
              }}
            />
            <Stack.Screen
              name="VerifyEmail"
              component={VerifyEmailScreen}
              options={{
                headerShown: true,
                title: t('navigation.verifyEmail'),
                headerTintColor: colors.textPrimary,
                headerBackTitle: ' ',
                headerShadowVisible: false,
                headerStyle: {
                  backgroundColor: colors.background,
                  shadowOpacity: 0,
                  elevation: 0,
                  borderBottomWidth: 0,
                },
                headerTitleStyle: {
                  fontWeight: '600',
                  fontSize: 17,
                  color: colors.textPrimary,
                },
              }}
            />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        ) : needsOnboarding ? (
          // Onboarding Stack (logged in but onboarding incomplete)
          <>
            <Stack.Screen
              name="Onboarding"
              component={OnboardingNavigator}
              initialParams={{ initialRoute: getInitialOnboardingRoute() }}
            />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        ) : (
          // Main App Stack (logged in and onboarding complete)
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen
              name="WeightAdd"
              component={WeightAdd}
              options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="StepsAdd"
              component={StepsAdd}
              options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="OtherUserProfile"
              component={UserProfileScreen}
              options={{ animation: 'slide_from_right', headerShown: false }}
            />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
