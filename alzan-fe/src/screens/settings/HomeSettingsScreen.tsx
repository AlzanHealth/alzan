import React from 'react';
import { formLayout } from '../../components/common/formLayout';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Download,
  Dumbbell,
  LayoutGrid,
  Scale,
  Utensils,
  Waves,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { SettingsStackParamList } from '../../navigation/SettingsNavigator';
import type { TranslationKey } from '../../i18n/locales/en';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { useHomeSettings } from '../../hooks/settings/useHomeSettings';
import { HomeMode, HomePdfSectionKey, HomePrimaryAction } from '../../constants/homeSettings';
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

const HOME_MODE_OPTIONS: Array<{ key: HomeMode; labelKey: TranslationKey }> = [
  { key: 'detailed', labelKey: 'settings.homeModeDetailed' },
  { key: 'compact', labelKey: 'settings.homeModeCompact' },
];

const PRIMARY_ACTION_OPTIONS: Array<{
  key: HomePrimaryAction;
  icon: LucideIcon;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  {
    key: 'smart_workout',
    icon: Dumbbell,
    labelKey: 'settings.homePrimaryActionSmartWorkout',
    descriptionKey: 'settings.homePrimaryActionSmartWorkoutDescription',
  },
  {
    key: 'add_meal',
    icon: Utensils,
    labelKey: 'settings.homePrimaryActionAddMeal',
    descriptionKey: 'settings.homePrimaryActionAddMealDescription',
  },
  {
    key: 'log_weight',
    icon: Scale,
    labelKey: 'settings.homePrimaryActionLogWeight',
    descriptionKey: 'settings.homePrimaryActionLogWeightDescription',
  },
  {
    key: 'open_nutrition',
    icon: Waves,
    labelKey: 'settings.homePrimaryActionOpenNutrition',
    descriptionKey: 'settings.homePrimaryActionOpenNutritionDescription',
  },
];

const PDF_SECTION_CONFIG: Record<HomePdfSectionKey, { labelKey: TranslationKey }> = {
  health: { labelKey: 'tabs.health' },
  training: { labelKey: 'settings.workout' },
  nutrition: { labelKey: 'tabs.nutrition' },
};

const moveItem = <T,>(items: T[], index: number, direction: -1 | 1): T[] => {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
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

type OrderButtonsProps = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  color: string;
  borderColor: string;
  moveUpLabel: string;
  moveDownLabel: string;
};

const OrderButtons = ({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  color,
  borderColor,
  moveUpLabel,
  moveDownLabel,
}: OrderButtonsProps) => (
  <View style={styles.orderButtons}>
    <TouchableOpacity
      style={[styles.orderButton, { borderColor }, !canMoveUp && styles.disabledControl]}
      onPress={onMoveUp}
      disabled={!canMoveUp}
      accessibilityLabel={moveUpLabel}
    >
      <ArrowUp size={16} color={color} />
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.orderButton, { borderColor }, !canMoveDown && styles.disabledControl]}
      onPress={onMoveDown}
      disabled={!canMoveDown}
      accessibilityLabel={moveDownLabel}
    >
      <ArrowDown size={16} color={color} />
    </TouchableOpacity>
  </View>
);

export const HomeSettingsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useSettingsStyles();
  const pdfExport = useSettingsCombinedPdfExport();
  const {
    homeMode,
    homePrimaryAction,
    homePdfSectionOrder,
    setHomeMode,
    setHomePrimaryAction,
    setHomePdfSectionOrder,
    updating,
  } = useHomeSettings();
  const iconBackgroundColor = isDark ? 'rgba(255,255,255,0.1)' : themeColors.background;
  const rowProps = {
    iconColor: themeColors.primary,
    iconBackgroundColor,
    titleColor: themeColors.textPrimary,
    descriptionColor: themeColors.textSecondary,
    borderColor: themeColors.border,
  };
  const selectedBackground = isDark ? 'rgba(10,132,255,0.18)' : 'rgba(0,122,255,0.1)';

  const handleMovePdfSection = (index: number, direction: -1 | 1) => {
    void setHomePdfSectionOrder(moveItem(homePdfSectionOrder, index, direction));
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
              <View style={[styles.divider, { backgroundColor: themeColors.border }]} />
              <View style={styles.controlBlock}>
                <Text style={[styles.controlTitle, { color: themeColors.textPrimary }]}>
                  {t('settings.homeModeTitle')}
                </Text>
                <View style={[styles.segmentedControl, { borderColor: themeColors.border }]}>
                  {HOME_MODE_OPTIONS.map(option => {
                    const isSelected = homeMode === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.segmentButton,
                          isSelected && { backgroundColor: selectedBackground },
                          option.key === 'compact' && { borderLeftColor: themeColors.border, borderLeftWidth: 1 },
                        ]}
                        onPress={() => void setHomeMode(option.key)}
                        disabled={updating}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            { color: isSelected ? themeColors.primary : themeColors.textSecondary },
                          ]}
                        >
                          {t(option.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: themeColors.border }]} />
              <View style={styles.controlBlock}>
                <Text style={[styles.controlTitle, { color: themeColors.textPrimary }]}>
                  {t('settings.homePrimaryActionTitle')}
                </Text>
                {PRIMARY_ACTION_OPTIONS.map(option => {
                  const Icon = option.icon;
                  const isSelected = homePrimaryAction === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.choiceRow, isSelected && { backgroundColor: selectedBackground }]}
                      onPress={() => void setHomePrimaryAction(option.key)}
                      disabled={updating}
                      activeOpacity={0.72}
                    >
                      <View style={[styles.choiceIcon, { backgroundColor: iconBackgroundColor }]}>
                        <Icon size={17} color={themeColors.primary} />
                      </View>
                      <View style={styles.choiceText}>
                        <Text style={[styles.choiceTitle, { color: themeColors.textPrimary }]}>
                          {t(option.labelKey)}
                        </Text>
                        <Text style={[styles.choiceDescription, { color: themeColors.textSecondary }]}>
                          {t(option.descriptionKey)}
                        </Text>
                      </View>
                      {isSelected ? <Check size={18} color={themeColors.primary} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
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
              <View style={[styles.divider, { backgroundColor: themeColors.border }]} />
              <View style={styles.controlBlock}>
                <Text style={[styles.controlTitle, { color: themeColors.textPrimary }]}>
                  {t('settings.pdfSectionOrderTitle')}
                </Text>
                {homePdfSectionOrder.map((key, index) => (
                  <View key={key} style={styles.orderRow}>
                    <Text style={[styles.orderIndex, { color: themeColors.textSecondary }]}>{index + 1}</Text>
                    <Text style={[styles.orderLabel, { color: themeColors.textPrimary }]}>
                      {t(PDF_SECTION_CONFIG[key].labelKey)}
                    </Text>
                    <OrderButtons
                      canMoveUp={index > 0 && !updating}
                      canMoveDown={index < homePdfSectionOrder.length - 1 && !updating}
                      onMoveUp={() => handleMovePdfSection(index, -1)}
                      onMoveDown={() => handleMovePdfSection(index, 1)}
                      color={themeColors.primary}
                      borderColor={themeColors.border}
                      moveUpLabel={t('training.moveUp')}
                      moveDownLabel={t('training.moveDown')}
                    />
                  </View>
                ))}
              </View>
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
    ...formLayout.settings,
    padding: spacing.m,
    paddingBottom: 96,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.m,
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
  controlBlock: {
    padding: spacing.m,
    gap: spacing.s,
  },
  controlTitle: {
    ...typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  segmentedControl: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: borderRadius.s,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s,
  },
  segmentText: {
    ...typography.button,
  },
  choiceRow: {
    minHeight: 68,
    borderRadius: borderRadius.s,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.s,
  },
  choiceIcon: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.s,
  },
  choiceText: {
    flex: 1,
    paddingRight: spacing.s,
  },
  choiceTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  choiceDescription: {
    ...typography.caption,
    lineHeight: 17,
    marginTop: 2,
  },
  orderRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderIndex: {
    ...typography.caption,
    width: 24,
    fontWeight: '800',
  },
  orderLabel: {
    ...typography.body,
    flex: 1,
    fontWeight: '700',
  },
  orderButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  orderButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.s,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledControl: {
    opacity: 0.35,
  },
});
