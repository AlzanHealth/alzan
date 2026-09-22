import React from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { useSettingsPrivacy } from '../../hooks/settings/useSettingsPrivacy';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SettingsStackParamList } from '../../navigation/SettingsNavigator';
import { Download, Trash2, AlertTriangle, X, LucideIcon } from 'lucide-react-native';
import { useState } from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';

type NavProp = StackNavigationProp<SettingsStackParamList>;

export const PrivacyDataScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useSettingsStyles();
  const navigation = useNavigation<NavProp>();
  const { loading, clearLocalCache, deleteAllData } = useSettingsPrivacy();

  const [showDeleteDataModal, setShowDeleteDataModal] = useState(false);

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{title.toUpperCase()}</Text>
  );

  const ActionRow = ({
    icon: Icon,
    label,
    onPress,
    isDestructive = false,
  }: {
    icon: LucideIcon;
    label: string;
    onPress: () => void;
    isDestructive?: boolean;
  }) => (
    <TouchableOpacity style={[styles.actionRow, isDestructive && styles.actionRowDestructive]} onPress={onPress}>
      <Icon size={20} color={isDestructive ? themeColors.danger : themeColors.textPrimary} />
      <Text style={[styles.actionLabel, { color: isDestructive ? themeColors.danger : themeColors.textPrimary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const handleClearCache = () => {
    Alert.alert(t('settings.clearCacheTitle'), t('settings.clearCacheConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.clearCacheAction'), style: 'destructive', onPress: clearLocalCache },
    ]);
  };

  const ConfirmModal = ({
    visible,
    onClose,
    onConfirm,
    title,
    description,
    confirmText,
  }: {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText: string;
  }) => (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF' }]}>
          <View style={styles.modalHeader}>
            <View style={[styles.iconContainer, { backgroundColor: themeColors.danger + '20' }]}>
              <AlertTriangle size={24} color={themeColors.danger} />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{title}</Text>
          <Text style={[styles.modalDesc, { color: themeColors.textSecondary }]}>{description}</Text>

          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onClose}>
              <Text style={[styles.modalButtonText, { color: themeColors.textPrimary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: themeColors.danger }]}
              onPress={() => {
                onClose();
                setTimeout(() => {
                  onConfirm();
                }, 300); // Wait for modal to close
              }}
            >
              <Text style={[styles.modalButtonText, { color: '#FFF' }]}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Social Features Coming Soon */}
          <View style={[styles.section, { opacity: 0.8 }]}>
            <SectionHeader title={t('settings.socialPrivacy')} />
            <View style={[styles.card, dynamicStyles.card, { alignItems: 'center', padding: spacing.l }]}>
              <View style={[styles.comingSoonBadge, { backgroundColor: themeColors.primary + '15' }]}>
                <Text style={[styles.comingSoonText, { color: themeColors.primary }]}>
                  {t('settings.comingSoonCaps')}
                </Text>
              </View>
              <Text style={[styles.comingSoonTitle, { color: themeColors.textPrimary }]}>
                {t('settings.socialNetworkComing')}
              </Text>
              <Text style={[styles.comingSoonDesc, { color: themeColors.textSecondary }]}>
                {t('settings.socialFeaturesComingSoon')}
              </Text>
            </View>
          </View>

          {/* Data Management */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.dataManagement')} />
            <View style={[styles.card, dynamicStyles.card]}>
              <ActionRow
                icon={Download}
                label={t('settings.exportData')}
                onPress={() => navigation.navigate('DataExport')}
              />

              <View style={[styles.divider, dynamicStyles.divider]} />
              <ActionRow icon={Trash2} label={t('settings.clearCache')} onPress={handleClearCache} isDestructive />
            </View>
          </View>

          {/* Danger Zone */}
          <View style={[styles.section, { marginBottom: 40 }]}>
            <SectionHeader title={t('settings.dangerZone')} />
            <View style={[styles.card, dynamicStyles.card, { borderColor: themeColors.danger + '40', borderWidth: 1 }]}>
              <ActionRow
                icon={Trash2}
                label={t('settings.deleteAllData')}
                onPress={() => setShowDeleteDataModal(true)}
                isDestructive
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <ActionRow
                icon={Trash2}
                label={t('settings.deleteAccount')}
                onPress={() => navigation.navigate('DeleteAccount')}
                isDestructive
              />
            </View>
          </View>

          <ConfirmModal
            visible={showDeleteDataModal}
            onClose={() => setShowDeleteDataModal(false)}
            title={t('settings.areYouSure')}
            description={t('settings.clearDataWarning')}
            confirmText={t('settings.clearData')}
            onConfirm={() => {
              Alert.alert(t('settings.finalConfirmation'), t('settings.irreversibleActionWarning'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('settings.deleteNow'), style: 'destructive', onPress: deleteAllData },
              ]);
            }}
          />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Background handled by LinearGradient
  },
  safeArea: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    ...formLayout.settings,
    padding: spacing.m,
    paddingBottom: 120,
  },
  section: {
    marginBottom: spacing.l,
  },
  sectionHeader: {
    ...typography.caption,
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.m,
    padding: spacing.m,
    ...shadows.soft,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s,
    gap: spacing.m,
  },
  actionRowDestructive: {},
  actionLabel: {
    fontSize: 16,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  comingSoonBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: spacing.m,
  },
  comingSoonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.s,
    textAlign: 'center',
  },
  comingSoonDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: '90%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
  },
  modalContent: {
    width: '100%',
    borderRadius: borderRadius.l,
    padding: spacing.l,
    ...shadows.soft,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.m,
  },
  iconContainer: {
    padding: spacing.s,
    borderRadius: borderRadius.full,
  },
  closeButton: {
    padding: spacing.xs,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.s,
  },
  modalDesc: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.l,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.m,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  modalButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
});
