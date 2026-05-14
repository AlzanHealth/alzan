import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useStravaConnection } from '../../hooks/useStravaConnection';

export const ConnectedAppsScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useSettingsStyles();
  const strava = useStravaConnection();

  const AppCard = ({
    name,
    connected,
    onConnect,
    onDisconnect,
    comingSoon = false,
    isLoading = false,
    isActioning = false,
  }: {
    name: string;
    connected: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    comingSoon?: boolean;
    isLoading?: boolean;
    isActioning?: boolean;
  }) => (
    <View style={[styles.card, dynamicStyles.card]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconPlaceholder, dynamicStyles.iconContainer]}>
          <Text style={[styles.iconText, { color: themeColors.textSecondary }]}>{name[0]}</Text>
        </View>
        <View style={styles.appInfo}>
          <Text style={[styles.appName, { color: themeColors.textPrimary }]}>{name}</Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={themeColors.textSecondary} style={styles.statusLoader} />
          ) : comingSoon ? (
            <Text style={[styles.statusTextPending, { color: themeColors.primary }]}>{t('alzan.comingSoon')}</Text>
          ) : (
            <Text
              style={
                connected
                  ? styles.statusTextConnected
                  : [styles.statusTextDisconnected, { color: themeColors.textSecondary }]
              }
            >
              {connected ? t('settings.connected') : t('settings.disconnected')}
            </Text>
          )}
        </View>
      </View>
      {!comingSoon && !isLoading && (
        <TouchableOpacity
          style={[
            styles.button,
            connected
              ? [styles.buttonDisconnect, { borderColor: themeColors.border }]
              : { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
          ]}
          onPress={connected ? onDisconnect : onConnect}
          disabled={isActioning}
        >
          {isActioning ? (
            <ActivityIndicator size="small" color={connected ? themeColors.textPrimary : themeColors.white} />
          ) : (
            <Text
              style={[
                styles.buttonText,
                connected
                  ? [styles.buttonTextDisconnect, { color: themeColors.textPrimary }]
                  : { color: themeColors.white },
              ]}
            >
              {connected ? t('settings.disconnect') : t('settings.connect')}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <ScrollView style={[styles.container, dynamicStyles.container]} contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: themeColors.textSecondary }]}>
          {t('settings.syncAppsDescription')}
        </Text>

        <AppCard
          name="Strava"
          connected={strava.isConnected}
          isLoading={strava.isLoading}
          isActioning={strava.isConnecting || strava.isDisconnecting}
          onConnect={strava.connect}
          onDisconnect={strava.disconnect}
        />

        <AppCard name="Suunto" connected={false} onConnect={() => {}} onDisconnect={() => {}} comingSoon />

        <AppCard name="Garmin" connected={false} onConnect={() => {}} onDisconnect={() => {}} comingSoon />

        <AppCard name="Apple Health" connected={false} onConnect={() => {}} onDisconnect={() => {}} comingSoon />

        <AppCard name="Health Connect" connected={false} onConnect={() => {}} onDisconnect={() => {}} comingSoon />
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.m,
    gap: spacing.m,
  },
  description: {
    ...typography.body,
    marginBottom: spacing.m,
  },
  card: {
    borderRadius: borderRadius.m,
    padding: spacing.m,
    ...shadows.soft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.s,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.m,
  },
  iconText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    ...typography.h4,
  },
  statusTextConnected: {
    fontSize: 12,
    color: colors.success,
    marginTop: 2,
  },
  statusTextDisconnected: {
    fontSize: 12,
    marginTop: 2,
  },
  statusTextPending: {
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },
  statusLoader: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  buttonDisconnect: {
    backgroundColor: 'transparent',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextDisconnect: {},
});
