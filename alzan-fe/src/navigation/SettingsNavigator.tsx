import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../context/ThemeContext';
import { SettingsHomeScreen } from '../screens/settings/SettingsHomeScreen';
import ProfileSettingsScreen from '../screens/settings/ProfileSettingsScreen';
import { ObjectivesSettingsScreen } from '../screens/settings/ObjectivesSettingsScreen';
import { NotificationsSettingsScreen } from '../screens/settings/NotificationsSettingsScreen';
import { ConnectedAppsScreen } from '../screens/settings/ConnectedAppsScreen';
import { PrivacyDataScreen } from '../screens/settings/PrivacyDataScreen';
import { AppearanceSettingsScreen } from '../screens/settings/AppearanceSettingsScreen';
import { SupportScreen } from '../screens/settings/SupportScreen';
import { LegalScreen } from '../screens/settings/LegalScreen';
import { DataExportScreen } from '../screens/settings/DataExportScreen';
import { DeleteAccountScreen } from '../screens/settings/DeleteAccountScreen';
import TrainingSettingsScreen from '../screens/training/TrainingSettingsScreen';
import { NutritionSettingsScreen } from '../screens/nutrition/NutritionSettingsScreen';
import { HealthSettingsScreen } from '../screens/settings/HealthSettingsScreen';
import { useTranslation } from 'react-i18next';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  ProfileSettings: undefined;
  ObjectivesSettings: undefined;
  NotificationsSettings: undefined;
  ConnectedApps: undefined;
  PrivacyData: undefined;
  AppearanceSettings: undefined;
  Support: undefined;
  Legal: undefined;
  DataExport: undefined;
  DeleteAccount: undefined;
  TrainingSettings: undefined;
  NutritionSettings: undefined;
  HealthSettings: undefined;
  StatsGlobal: undefined;
};

const Stack = createStackNavigator<SettingsStackParamList>();

export const SettingsNavigator = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.textPrimary,
        headerBackTitle: t('tabs.settings'),
        headerStyle: {
          backgroundColor: colors.background,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTitleStyle: {
          color: colors.textPrimary,
        },
        cardStyle: {
          backgroundColor: colors.background,
          flex: 1,
        },
      }}
    >
      <Stack.Screen name="SettingsHome" component={SettingsHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ProfileSettings"
        component={ProfileSettingsScreen}
        options={{ title: t('navigation.profile') }}
      />
      <Stack.Screen
        name="ObjectivesSettings"
        component={ObjectivesSettingsScreen}
        options={{ title: t('navigation.goals') }}
      />
      <Stack.Screen
        name="NotificationsSettings"
        component={NotificationsSettingsScreen}
        options={{ title: t('navigation.notifications') }}
      />
      <Stack.Screen
        name="ConnectedApps"
        component={ConnectedAppsScreen}
        options={{ title: t('navigation.integrations') }}
      />
      <Stack.Screen name="PrivacyData" component={PrivacyDataScreen} options={{ title: t('navigation.privacyData') }} />
      <Stack.Screen
        name="AppearanceSettings"
        component={AppearanceSettingsScreen}
        options={{ title: t('navigation.appearance') }}
      />
      <Stack.Screen name="Support" component={SupportScreen} options={{ title: t('navigation.support') }} />
      <Stack.Screen name="Legal" component={LegalScreen} options={{ title: t('navigation.legal') }} />
      <Stack.Screen
        name="TrainingSettings"
        component={TrainingSettingsScreen}
        options={{ title: t('navigation.workoutSettings') }}
      />
      <Stack.Screen
        name="NutritionSettings"
        component={NutritionSettingsScreen}
        options={{ title: t('navigation.nutritionSettings') }}
      />
      <Stack.Screen
        name="HealthSettings"
        component={HealthSettingsScreen}
        options={{ title: t('navigation.healthSettings') }}
      />
      <Stack.Screen name="DataExport" component={DataExportScreen} options={{ title: t('navigation.exportData') }} />
      <Stack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: t('navigation.deleteAccount') }}
      />
    </Stack.Navigator>
  );
};
