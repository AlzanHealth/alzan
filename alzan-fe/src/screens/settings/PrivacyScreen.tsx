import React, { useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { FileText, Download, Trash2, CheckCircle, X, LucideIcon } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { SettingsStackParamList } from '../../navigation/SettingsNavigator';
import { StackNavigationProp } from '@react-navigation/stack';
import { PRIVACY_POLICY, TERMS_AND_CONDITIONS, HEALTH_CONSENT } from '../../utils/gdpr/legalTexts';
import { useTranslation } from 'react-i18next';

type NavProp = StackNavigationProp<SettingsStackParamList>;

interface LegalModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  content: string;
  themeColors: ReturnType<typeof useSettingsStyles>['colors'];
  dynamicStyles: ReturnType<typeof useSettingsStyles>['styles'];
}

interface PrivacyOptionProps {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  isDestructive?: boolean;
  themeColors: ReturnType<typeof useSettingsStyles>['colors'];
  dynamicStyles: ReturnType<typeof useSettingsStyles>['styles'];
}

const LegalModal = ({ visible, onClose, title, content, themeColors, dynamicStyles }: LegalModalProps) => (
  <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
    <SafeAreaView style={[styles.modalContainer, dynamicStyles.container]} edges={['top', 'bottom']}>
      <View style={[styles.modalHeader, dynamicStyles.card]}>
        <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{title}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <X size={24} color={themeColors.textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.modalContent}>
        <Text style={[styles.legalText, { color: themeColors.textPrimary }]}>{content}</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>
);

const PrivacyOption = ({
  icon: Icon,
  label,
  onPress,
  isDestructive,
  themeColors,
  dynamicStyles,
}: PrivacyOptionProps) => (
  <TouchableOpacity
    style={[styles.option, dynamicStyles.card, isDestructive && styles.optionDestructive]}
    onPress={onPress}
  >
    <View style={styles.optionRow}>
      <Icon size={20} color={isDestructive ? themeColors.danger : themeColors.textPrimary} />
      <Text
        style={[styles.optionText, { color: themeColors.textPrimary }, isDestructive && { color: themeColors.danger }]}
      >
        {label}
      </Text>
    </View>
    <Text style={[styles.chevron, { color: themeColors.textSecondary }]}>›</Text>
  </TouchableOpacity>
);

export const PrivacyScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { styles: dynamicStyles, colors: themeColors } = useSettingsStyles();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', content: '' });

  const openModal = (title: string, content: string) => {
    setModalContent({ title, content });
    setModalVisible(true);
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <ScrollView style={[styles.container, dynamicStyles.container]} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>{t('settings.legalDocs')}</Text>
          <View style={[styles.card, dynamicStyles.card]}>
            <PrivacyOption
              icon={FileText}
              label={t('auth.privacyPolicy')}
              onPress={() => openModal(t('auth.privacyPolicy'), PRIVACY_POLICY)}
              themeColors={themeColors}
              dynamicStyles={dynamicStyles}
            />
            <View style={[styles.separator, { backgroundColor: themeColors.border }]} />
            <PrivacyOption
              icon={FileText}
              label={t('settings.termsConditions')}
              onPress={() => openModal(t('settings.termsConditions'), TERMS_AND_CONDITIONS)}
              themeColors={themeColors}
              dynamicStyles={dynamicStyles}
            />
            <View style={[styles.separator, { backgroundColor: themeColors.border }]} />
            <PrivacyOption
              icon={CheckCircle}
              label={t('settings.healthConsent')}
              onPress={() => openModal(t('settings.consent'), HEALTH_CONSENT)}
              themeColors={themeColors}
              dynamicStyles={dynamicStyles}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>{t('settings.dataManagement')}</Text>
          <View style={[styles.card, dynamicStyles.card]}>
            <PrivacyOption
              icon={Download}
              label={t('settings.exportData')}
              onPress={() => navigation.navigate('DataExport')}
              themeColors={themeColors}
              dynamicStyles={dynamicStyles}
            />
            <View style={[styles.separator, { backgroundColor: themeColors.border }]} />
            <PrivacyOption
              icon={Trash2}
              label={t('settings.deleteAccount')}
              isDestructive
              onPress={() => navigation.navigate('DeleteAccount')}
              themeColors={themeColors}
              dynamicStyles={dynamicStyles}
            />
          </View>
        </View>

        <LegalModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          title={modalContent.title}
          content={modalContent.content}
          themeColors={themeColors}
          dynamicStyles={dynamicStyles}
        />
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    ...formLayout.settings,
    padding: spacing.m,
  },
  section: {
    marginBottom: spacing.l,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: spacing.m,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.m,
    overflow: 'hidden',
    ...shadows.soft,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
    backgroundColor: colors.white,
  },
  optionDestructive: {
    backgroundColor: '#FFF5F5',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  optionText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  optionTextDestructive: {
    color: colors.danger,
  },
  chevron: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 44, // Icon + gap
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.s,
  },
  modalContent: {
    padding: spacing.m,
  },
  legalText: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
