import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { ChevronRight, Download, LayoutGrid } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { SettingsStackParamList } from '../../navigation/SettingsNavigator';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { spacing, typography, borderRadius, shadows } from '../../theme';
import { SettingsPdfExportModal } from './SettingsPdfExportModal';
import { useSettingsCombinedPdfExport } from './useSettingsCombinedPdfExport';

type NavigationProp = StackNavigationProp<SettingsStackParamList, 'HomeSettings'>;

type HomeSettingsRowProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  meta?: string;
  onPress: () => void;
  iconColor: string;
  iconBackgroundColor: string;
  titleColor: string;
  descriptionColor: string;
  borderColor: string;
  disabled?: boolean;
  trailing?: React.ReactNode;
};

const HomeSettingsRow = ({
  icon: Icon,
  title,
  description,
  meta,
  onPress,
  iconColor,
  iconBackgroundColor,
  titleColor,
  descriptionColor,
  borderColor,
  disabled,
  trailing,
}: HomeSettingsRowProps) => (
  <TouchableOpacity
    style={[styles.row, { borderBottomColor: borderColor }, disabled && styles.disabledRow]}
    onPress={onPress}
    activeOpacity={0.72}
    disabled={disabled}
  >
    <View style={[styles.iconContainer, { backgroundColor: iconBackgroundColor }]}>
      <Icon size={19} color={iconColor} />
    </View>
    <View style={styles.rowText}>
      <Text style={[styles.rowTitle, { color: titleColor }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.rowDescription, { color: descriptionColor }]}>{description}</Text>
      {meta ? <Text style={[styles.rowMeta, { color: descriptionColor }]}>{meta}</Text> : null}
    </View>
    <View style={styles.trailing}>{trailing}</View>
  </TouchableOpacity>
);

export const HomeSettingsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useSettingsStyles();
  const pdfExport = useSettingsCombinedPdfExport();
  const iconBackgroundColor = isDark ? 'rgba(255,255,255,0.1)' : themeColors.background;
  const rowProps = {
    iconColor: themeColors.primary,
    iconBackgroundColor,
    titleColor: themeColors.textPrimary,
    descriptionColor: themeColors.textSecondary,
    borderColor: themeColors.border,
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.description, dynamicStyles.sublabel]}>{t('settings.homeSettingsDescription')}</Text>

          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{t('settings.homeAllCaps')}</Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <HomeSettingsRow
                icon={LayoutGrid}
                title={t('settings.homeCardsTitle')}
                description={t('settings.homeCardsSubtitle')}
                onPress={() => navigation.navigate('HomeCards')}
                trailing={<ChevronRight size={20} color={themeColors.textSecondary} />}
                {...rowProps}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{t('settings.pdfReportsAllCaps')}</Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <HomeSettingsRow
                icon={Download}
                title={t('settings.exportCombinedPdf')}
                description={
                  pdfExport.isExporting ? t('settings.exportingCombinedPdf') : t('settings.exportCombinedPdfSubtitle')
                }
                meta={pdfExport.lastRangeLabel}
                onPress={pdfExport.openModal}
                disabled={pdfExport.isExporting}
                trailing={
                  pdfExport.isExporting ? (
                    <ActivityIndicator size="small" color={themeColors.primary} />
                  ) : (
                    <ChevronRight size={20} color={themeColors.textSecondary} />
                  )
                }
                {...rowProps}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <SettingsPdfExportModal controller={pdfExport} />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.m,
    paddingBottom: 96,
  },
  description: {
    ...typography.body,
    lineHeight: 23,
    marginBottom: spacing.l,
  },
  section: {
    marginBottom: spacing.l,
  },
  sectionHeader: {
    ...typography.caption,
    textTransform: 'uppercase',
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.m,
    overflow: 'hidden',
    ...shadows.soft,
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    borderBottomWidth: 0,
  },
  disabledRow: {
    opacity: 0.62,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.s,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.m,
  },
  rowText: {
    flex: 1,
    paddingRight: spacing.s,
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  rowDescription: {
    ...typography.caption,
    lineHeight: 18,
    marginTop: 3,
  },
  rowMeta: {
    ...typography.caption,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  trailing: {
    minWidth: 24,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
});
