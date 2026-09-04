import React, { useCallback, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  SafeAreaView,
} from 'react-native';
import { ArrowLeft, Info } from 'lucide-react-native';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useStravaConnection } from '../../hooks/useStravaConnection';
import { useAppleHealthConnection } from '../../hooks/useAppleHealthConnection';
import { useHealthConnectConnection } from '../../hooks/useHealthConnectConnection';
import { usePolarConnection } from '../../hooks/usePolarConnection';
import { useSuuntoConnection } from '../../hooks/useSuuntoConnection';
import { useCorosConnection } from '../../hooks/useCorosConnection';
import { useTabBarLayout } from '../../navigation/tabBarLayout';
import { getCorosConnectionInfo } from './corosConnectionInfo.helper';
import { getConnectedAppsContentBottomPadding } from './connectedAppsLayout.helper';

type PermissionFlow = {
  serviceName: string;
  description: string;
  onContinue: () => void;
};

export const ConnectedAppsScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useSettingsStyles();
  const { topFromScreenBottom } = useTabBarLayout();
  const strava = useStravaConnection();
  const appleHealth = useAppleHealthConnection();
  const healthConnect = useHealthConnectConnection();
  const polar = usePolarConnection();
  const suunto = useSuuntoConnection();
  const coros = useCorosConnection();
  const [permissionFlow, setPermissionFlow] = useState<PermissionFlow | null>(null);
  const [corosInfoVisible, setCorosInfoVisible] = useState(false);
  const corosConnectionInfo = getCorosConnectionInfo();
  const formatLastSync = (lastSyncedAt?: string | null) =>
    lastSyncedAt ? t('settings.lastSync', { date: new Date(lastSyncedAt).toLocaleDateString() }) : null;

  const importCorosHistory = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/fit', 'application/octet-stream'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!result.canceled) coros.importHistory(result.assets);
  }, [coros]);

  const openPermissionFlow = useCallback((flow: PermissionFlow) => {
    setPermissionFlow(flow);
  }, []);

  const closePermissionFlow = useCallback(() => {
    setPermissionFlow(null);
  }, []);

  const continuePermissionFlow = useCallback(() => {
    const flow = permissionFlow;
    setPermissionFlow(null);
    flow?.onContinue();
  }, [permissionFlow]);

  const openOAuthFlow = useCallback(
    (serviceName: string, onContinue: () => void) => {
      openPermissionFlow({
        serviceName,
        description: t('settings.permissionSheetOAuthDescription', { service: serviceName }),
        onContinue,
      });
    },
    [openPermissionFlow, t],
  );

  const openHealthPermissionFlow = useCallback(
    (serviceName: string, onContinue: () => void) => {
      openPermissionFlow({
        serviceName,
        description: t('settings.permissionSheetHealthDescription', { service: serviceName }),
        onContinue,
      });
    },
    [openPermissionFlow, t],
  );

  const AppCard = ({
    name,
    connected,
    onConnect,
    onDisconnect,
    onSync,
    onImport,
    detail,
    comingSoon = false,
    isLoading = false,
    isActioning = false,
    isSyncing = false,
    isImporting = false,
    onInfo,
    statusLabel,
  }: {
    name: string;
    connected: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    onSync?: () => void;
    onImport?: () => void;
    detail?: string | null;
    comingSoon?: boolean;
    isLoading?: boolean;
    isActioning?: boolean;
    isSyncing?: boolean;
    isImporting?: boolean;
    onInfo?: () => void;
    statusLabel?: string;
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
            <Text style={[styles.statusTextPending, { color: themeColors.primary }]}>
              {statusLabel ?? t('alzan.comingSoon')}
            </Text>
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
          {!!detail && <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>{detail}</Text>}
        </View>
        {onInfo && (
          <TouchableOpacity
            style={[styles.infoButton, { borderColor: themeColors.border }]}
            onPress={onInfo}
            accessibilityRole="button"
            accessibilityLabel={t('settings.corosInfoButton')}
            accessibilityHint={t('settings.corosInfoButtonHint')}
          >
            <Info size={20} color={themeColors.primary} />
          </TouchableOpacity>
        )}
      </View>
      {!comingSoon && !isLoading && (
        <View style={styles.actions}>
          {connected && onImport && (
            <TouchableOpacity
              style={[styles.iconButton, { borderColor: themeColors.border }]}
              onPress={onImport}
              disabled={isImporting}
            >
              {isImporting ? (
                <ActivityIndicator size="small" color={themeColors.textPrimary} />
              ) : (
                <Text style={[styles.buttonText, { color: themeColors.textPrimary }]}>
                  {t('settings.corosImportHistory')}
                </Text>
              )}
            </TouchableOpacity>
          )}
          {connected && onSync && (
            <TouchableOpacity
              style={[styles.iconButton, { borderColor: themeColors.border }]}
              onPress={onSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={themeColors.textPrimary} />
              ) : (
                <Text style={[styles.buttonText, { color: themeColors.textPrimary }]}>{t('settings.sync')}</Text>
              )}
            </TouchableOpacity>
          )}
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
        </View>
      )}
    </View>
  );

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <ScrollView
        style={[styles.container, dynamicStyles.container]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: getConnectedAppsContentBottomPadding(topFromScreenBottom, spacing.l) },
        ]}
      >
        <Text style={[styles.description, { color: themeColors.textSecondary }]}>
          {t('settings.syncAppsDescription')}
        </Text>

        <AppCard
          name="Strava"
          connected={strava.isConnected}
          isLoading={strava.isLoading}
          isActioning={strava.isConnecting || strava.isDisconnecting}
          onConnect={() => openOAuthFlow('Strava', strava.connect)}
          onDisconnect={strava.disconnect}
        />

        <AppCard
          name="Suunto"
          connected={suunto.isConnected}
          isLoading={suunto.isLoading}
          isActioning={suunto.isConnecting || suunto.isDisconnecting}
          isSyncing={suunto.isSyncing}
          onConnect={() => openOAuthFlow('Suunto', suunto.connect)}
          onDisconnect={suunto.disconnect}
          onSync={suunto.sync}
          detail={formatLastSync(suunto.lastSyncedAt)}
        />

        <AppCard
          name="COROS"
          connected={coros.isConnected}
          isLoading={coros.isLoading}
          isActioning={coros.isConnecting || coros.isDisconnecting}
          isSyncing={coros.isSyncing}
          comingSoon={!coros.isAvailable && !coros.isConnected}
          statusLabel={t('settings.corosNotAvailable')}
          onConnect={() =>
            openPermissionFlow({
              serviceName: 'COROS',
              description: t('settings.permissionSheetCorosDescription'),
              onContinue: coros.connect,
            })
          }
          onDisconnect={coros.disconnect}
          onSync={coros.sync}
          onImport={importCorosHistory}
          isImporting={coros.isImportingHistory}
          detail={formatLastSync(coros.lastSyncedAt)}
          onInfo={() => setCorosInfoVisible(true)}
        />

        <AppCard name="Garmin" connected={false} onConnect={() => {}} onDisconnect={() => {}} comingSoon />

        <AppCard
          name="Polar"
          connected={polar.isConnected}
          isLoading={polar.isLoading}
          isActioning={polar.isConnecting || polar.isDisconnecting}
          isSyncing={polar.isSyncing}
          onConnect={() => openOAuthFlow('Polar', polar.connect)}
          onDisconnect={polar.disconnect}
          onSync={polar.sync}
          detail={formatLastSync(polar.lastSyncedAt)}
        />

        <AppCard
          name="Apple Health"
          connected={appleHealth.isConnected}
          isLoading={appleHealth.isLoading}
          isActioning={appleHealth.isConnecting || appleHealth.isDisconnecting}
          isSyncing={appleHealth.isSyncing}
          onConnect={() => openHealthPermissionFlow('Apple Health', appleHealth.connect)}
          onDisconnect={appleHealth.disconnect}
          onSync={() => openHealthPermissionFlow('Apple Health', appleHealth.sync)}
          detail={formatLastSync(appleHealth.lastSyncedAt)}
        />

        <AppCard
          name="Health Connect"
          connected={healthConnect.isConnected}
          isLoading={healthConnect.isLoading}
          isActioning={healthConnect.isConnecting || healthConnect.isDisconnecting}
          isSyncing={healthConnect.isSyncing}
          onConnect={() => openHealthPermissionFlow('Health Connect', healthConnect.connect)}
          onDisconnect={healthConnect.disconnect}
          onSync={() => openHealthPermissionFlow('Health Connect', healthConnect.sync)}
          detail={
            healthConnect.selectedOriginName ??
            healthConnect.selectedPackageName ??
            formatLastSync(healthConnect.lastSyncedAt)
          }
        />
        {healthConnect.availableOrigins.length > 1 && (
          <View style={styles.originSelector}>
            <Text style={[styles.originSelectorTitle, { color: themeColors.textPrimary }]}>
              {t('settings.healthConnectSourceTitle')}
            </Text>
            <View style={styles.originList}>
              {healthConnect.availableOrigins.map(origin => {
                const packageName = origin.source_package;
                if (!packageName) return null;
                const isSelected = packageName === healthConnect.selectedPackageName;
                return (
                  <TouchableOpacity
                    key={origin.id}
                    style={[
                      styles.originButton,
                      {
                        borderColor: isSelected ? themeColors.primary : themeColors.border,
                        backgroundColor: isSelected ? themeColors.primary : 'transparent',
                      },
                    ]}
                    onPress={() => healthConnect.selectOrigin(packageName)}
                    disabled={healthConnect.isSyncing}
                  >
                    <Text
                      style={[
                        styles.originButtonText,
                        { color: isSelected ? themeColors.white : themeColors.textPrimary },
                      ]}
                    >
                      {origin.display_name ?? packageName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
      <Modal
        visible={corosInfoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCorosInfoVisible(false)}
      >
        <SafeAreaView style={styles.infoModalOverlay}>
          <View style={[styles.infoCard, { backgroundColor: themeColors.cardBackground }]}>
            <View style={styles.infoHeader}>
              <View style={styles.infoTitleRow}>
                <View style={[styles.infoIcon, { backgroundColor: dynamicStyles.iconContainer.backgroundColor }]}>
                  <Info size={22} color={themeColors.primary} />
                </View>
                <Text style={[styles.infoTitle, { color: themeColors.textPrimary }]}>
                  {t('settings.corosInfoTitle')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.infoCloseButton}
                onPress={() => setCorosInfoVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t('settings.corosInfoClose')}
              >
                <Text style={[styles.infoCloseText, { color: themeColors.textSecondary }]}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.infoScrollView} contentContainerStyle={styles.infoContent}>
              <Text style={[styles.infoSectionTitle, { color: themeColors.textPrimary }]}>
                {t('settings.corosInfoWhereTitle')}
              </Text>
              <Text style={[styles.infoBody, { color: themeColors.textSecondary }]}>
                {t('settings.corosInfoLocation', { location: corosConnectionInfo.location })}
              </Text>

              <Text style={[styles.infoSectionTitle, { color: themeColors.textPrimary }]}>
                {t('settings.corosInfoSyncTitle')}
              </Text>
              <Text style={[styles.infoBody, { color: themeColors.textSecondary }]}>{t('settings.corosInfoSync')}</Text>

              <Text style={[styles.infoSectionTitle, { color: themeColors.textPrimary }]}>
                {t('settings.corosInfoHistoryTitle')}
              </Text>
              <Text style={[styles.infoBody, { color: themeColors.textSecondary }]}>
                {t('settings.corosInfoHistory')}
              </Text>

              <Text style={[styles.infoSectionTitle, { color: themeColors.textPrimary }]}>
                {t('settings.corosInfoDataTitle')}
              </Text>
              <Text style={[styles.infoBody, { color: themeColors.textSecondary }]}>
                {t('settings.corosInfoData', { dataFlow: corosConnectionInfo.dataFlow })}
              </Text>

              <Text style={[styles.infoSectionTitle, { color: themeColors.textPrimary }]}>
                {t('settings.corosInfoPrivacyTitle')}
              </Text>
              <Text style={[styles.infoBody, { color: themeColors.textSecondary }]}>
                {t('settings.corosInfoPrivacy')}
              </Text>

              <Text style={[styles.infoSectionTitle, { color: themeColors.textPrimary }]}>
                {t('settings.corosInfoTechnicalTitle')}
              </Text>
              <Text style={[styles.infoBody, { color: themeColors.textSecondary }]}>
                {t('settings.corosInfoTechnical', {
                  localCallback: corosConnectionInfo.localCallback,
                  productionCallback: corosConnectionInfo.productionCallback,
                })}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={[styles.infoDoneButton, { backgroundColor: themeColors.primary }]}
              onPress={() => setCorosInfoVisible(false)}
              accessibilityRole="button"
            >
              <Text style={[styles.infoDoneText, { color: themeColors.white }]}>{t('settings.corosInfoClose')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={permissionFlow !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closePermissionFlow}
      >
        <SafeAreaView style={[styles.permissionModal, { backgroundColor: themeColors.background }]}>
          <View style={styles.permissionHeader}>
            <TouchableOpacity
              style={styles.permissionBackButton}
              onPress={closePermissionFlow}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <ArrowLeft size={24} color={themeColors.textPrimary} />
              <Text style={[styles.permissionCancelText, { color: themeColors.textPrimary }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.permissionContent}>
            <View style={[styles.permissionIcon, dynamicStyles.iconContainer]}>
              <Text style={[styles.permissionIconText, { color: themeColors.textSecondary }]}>
                {permissionFlow?.serviceName[0] ?? 'A'}
              </Text>
            </View>
            <Text style={[styles.permissionTitle, { color: themeColors.textPrimary }]}>
              {t('settings.permissionSheetTitle', { service: permissionFlow?.serviceName })}
            </Text>
            <Text style={[styles.permissionBody, { color: themeColors.textSecondary }]}>
              {permissionFlow?.description}
            </Text>
          </View>
          <View style={styles.permissionFooter}>
            <TouchableOpacity
              style={[styles.permissionContinueButton, { backgroundColor: themeColors.primary }]}
              onPress={continuePermissionFlow}
              accessibilityRole="button"
            >
              <Text style={[styles.permissionContinueText, { color: themeColors.white }]}>
                {t('settings.permissionSheetContinue')}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
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
  infoButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.s,
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    ...typography.h4,
  },
  detailText: {
    fontSize: 11,
    marginTop: 2,
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  iconButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextDisconnect: {},
  originSelector: {
    gap: spacing.s,
    marginTop: -spacing.s,
    paddingHorizontal: spacing.s,
  },
  originSelectorTitle: {
    ...typography.caption,
    fontWeight: '600',
  },
  originList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  originButton: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  originButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  permissionModal: {
    flex: 1,
  },
  permissionHeader: {
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
  },
  permissionBackButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.m,
  },
  permissionCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  permissionContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.m,
  },
  permissionIcon: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s,
  },
  permissionIconText: {
    fontSize: 28,
    fontWeight: '700',
  },
  permissionTitle: {
    ...typography.h2,
  },
  permissionBody: {
    ...typography.body,
    lineHeight: 24,
  },
  permissionFooter: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.m,
  },
  permissionContinueButton: {
    minHeight: 52,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionContinueText: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.m,
  },
  infoCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    borderRadius: borderRadius.l,
    padding: spacing.l,
    ...shadows.soft,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.s,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    ...typography.h3,
    flexShrink: 1,
  },
  infoCloseButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCloseText: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '300',
  },
  infoContent: {
    gap: spacing.s,
    paddingVertical: spacing.m,
  },
  infoScrollView: {
    flex: 1,
  },
  infoSectionTitle: {
    ...typography.body,
    fontWeight: '700',
    marginTop: spacing.s,
  },
  infoBody: {
    ...typography.body,
    lineHeight: 22,
  },
  infoDoneButton: {
    minHeight: 48,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
  },
  infoDoneText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
