import React from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, typography, borderRadius, shadows } from '../../theme';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { Lightbulb, Bug, LucideIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/common/Alert';

export const SupportScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useSettingsStyles();

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{title.toUpperCase()}</Text>
  );

  const SupportItem = ({
    icon: Icon,
    label,
    description,
    onPress,
  }: {
    icon: LucideIcon;
    label: string;
    description?: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.supportItem} onPress={onPress}>
      <View style={[styles.iconContainer, dynamicStyles.iconContainer]}>
        <Icon size={20} color={themeColors.primary} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemLabel, { color: themeColors.textPrimary }]}>{label}</Text>
        {description && (
          <Text style={[styles.itemDescription, { color: themeColors.textSecondary }]}>{description}</Text>
        )}
      </View>
      <Text style={[styles.chevron, { color: themeColors.textSecondary }]}>›</Text>
    </TouchableOpacity>
  );

  const handleRequestFeature = () => {
    const email = 'hello@alzanhealth.com';
    const subject = t('settings.featureRequestSubject');
    const body = t('settings.featureRequestBody');
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`).catch(
      () => Alert.alert(t('common.error'), t('settings.mailAppNotFound')),
    );
  };

  const handleReportBug = () => {
    const email = 'support@alzanhealth.com';
    const subject = t('settings.bugReportSubject');
    const body = t('settings.bugReportBody');
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`).catch(
      () => Alert.alert(t('common.error'), t('settings.mailAppNotFound')),
    );
  };

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <SectionHeader title={t('settings.feedback')} />
            <View style={[styles.card, dynamicStyles.card]}>
              <SupportItem
                icon={Lightbulb}
                label={t('settings.requestFeature')}
                description={t('settings.suggestFeatures')}
                onPress={handleRequestFeature}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <SupportItem
                icon={Bug}
                label={t('settings.reportBug')}
                description={t('settings.improveApp')}
                onPress={handleReportBug}
              />
            </View>
          </View>
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
  supportItem: {
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
  itemInfo: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  itemDescription: {
    fontSize: 13,
    marginTop: 2,
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
