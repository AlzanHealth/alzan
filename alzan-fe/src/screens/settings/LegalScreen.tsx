import React, { useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, typography, borderRadius, shadows } from '../../theme';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { FileText, LucideIcon, Scale } from 'lucide-react-native';
import { PRIVACY_POLICY, TERMS_AND_CONDITIONS } from '../../utils/gdpr/legalTexts';
import { LegalModal } from '../../components/LegalModal';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

const LICENSES_LIST = `React Native - MIT License
Copyright (c) Meta Platforms, Inc. and affiliates.

React Navigation - MIT License
Copyright (c) 2017 React Navigation Contributors

Supabase - Apache License 2.0
Copyright (c) 2020-2023 Supabase Inc.

Lucide Icons - ISC License
Copyright (c) 2020 Lucide Contributors

date-fns - MIT License
Copyright (c) 2021 Sasha Koss and Lesha Koss

React Query - MIT License
Copyright (c) 2019 Tanner Linsley`;

export const LegalScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useSettingsStyles();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', content: '' });
  const licensesText = `${t('settings.openSourceLibrariesIntro')}\n\n${LICENSES_LIST}\n\n${t('settings.openSourceThanks')}`;

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{title.toUpperCase()}</Text>
  );

  const LegalItem = ({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) => (
    <TouchableOpacity style={styles.legalItem} onPress={onPress}>
      <View style={[styles.iconContainer, dynamicStyles.iconContainer]}>
        <Icon size={20} color={themeColors.primary} />
      </View>
      <Text style={[styles.itemLabel, { color: themeColors.textPrimary }]}>{label}</Text>
      <Text style={[styles.chevron, { color: themeColors.textSecondary }]}>›</Text>
    </TouchableOpacity>
  );

  const openModal = (title: string, content: string) => {
    setModalContent({ title, content });
    setModalVisible(true);
  };

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <SectionHeader title={t('settings.legalDocs')} />
            <View style={[styles.card, dynamicStyles.card]}>
              <LegalItem
                icon={FileText}
                label={t('settings.terms')}
                onPress={() => openModal(t('auth.terms'), TERMS_AND_CONDITIONS)}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <LegalItem
                icon={FileText}
                label={t('settings.privacyPolicy')}
                onPress={() => openModal(t('auth.privacyPolicy'), PRIVACY_POLICY)}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <LegalItem
                icon={Scale}
                label={t('settings.licenses')}
                onPress={() => openModal(t('settings.openSource'), licensesText)}
              />
            </View>
          </View>
        </ScrollView>

        <LegalModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          title={modalContent.title}
          content={modalContent.content}
        />
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
    overflow: 'hidden',
    ...shadows.soft,
  },
  legalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.s,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.m,
  },
  itemLabel: {
    flex: 1,
    fontSize: 16,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginLeft: 60,
  },
});
