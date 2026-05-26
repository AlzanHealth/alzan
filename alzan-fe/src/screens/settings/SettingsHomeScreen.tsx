import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import iconA from '../../../assets/iconA.png';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  Target,
  Bell,
  Link,
  Shield,
  Palette,
  HelpCircle,
  FileText,
  LogOut,
  Dumbbell,
  Apple,
  Heart,
  ChevronLeft,
  LucideIcon,
} from 'lucide-react-native';
import { spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { SettingsStackParamList } from '../../navigation/SettingsNavigator';
import { supabase } from '../../lib/supabaseClient';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';

type NavigationProp = StackNavigationProp<SettingsStackParamList>;

interface SettingsItemProps {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  iconColor: string;
  iconBg: string;
  textColor: string;
  chevronColor: string;
  itemBg: string;
  showDivider?: boolean;
  dividerColor: string;
}

const SettingsItem = ({
  icon: Icon,
  label,
  onPress,
  iconColor,
  iconBg,
  textColor,
  chevronColor,
  itemBg,
  showDivider = true,
  dividerColor,
}: SettingsItemProps) => (
  <>
    <TouchableOpacity style={[styles.itemContainer, { backgroundColor: itemBg }]} onPress={onPress}>
      <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
        <Icon size={18} color={iconColor} />
      </View>
      <Text style={[styles.itemLabel, { color: textColor }]}>{label}</Text>
      <Text style={[styles.chevron, { color: chevronColor }]}>›</Text>
    </TouchableOpacity>
    {showDivider && <View style={[styles.divider, { backgroundColor: dividerColor }]} />}
  </>
);

export const SettingsHomeScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { colors, isDark } = useTheme();

  // Dynamic styles based on theme
  const dynamicStyles = {
    // safeArea: { backgroundColor: colors.background }, // Removed to show gradient
    headerTitle: { color: colors.textPrimary },
    sectionHeader: { color: colors.textSecondary },
    card: { backgroundColor: isDark ? colors.surfaceSolid : colors.white },
    itemContainer: { backgroundColor: isDark ? colors.surfaceSolid : colors.white },
    iconContainer: { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.background },
    itemLabel: { color: colors.textPrimary },
    chevron: { color: colors.textSecondary },
    divider: { backgroundColor: colors.border },
    version: { color: colors.textSecondary },
    logoutButton: { backgroundColor: isDark ? 'rgba(255,69,58,0.15)' : '#FFF5F5' },
  };

  const handleLogout = () => {
    Alert.alert(t('settings.logoutTitle'), t('settings.logoutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logoutAction'),
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  const itemProps = {
    iconColor: colors.primary,
    iconBg: dynamicStyles.iconContainer.backgroundColor,
    textColor: colors.textPrimary,
    chevronColor: colors.textSecondary,
    itemBg: dynamicStyles.itemContainer.backgroundColor,
    dividerColor: colors.border,
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart || colors.background, colors.gradientEnd || colors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 24, alignItems: 'flex-start' }}>
            <ChevronLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, dynamicStyles.headerTitle]}>{t('settings.adjustments')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          {/* Usuario y Metas */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>
              {t('settings.usernamePlaceholderAllCaps')}
            </Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <SettingsItem
                icon={User}
                label={t('navigation.profile')}
                onPress={() => navigation.navigate('ProfileSettings')}
                {...itemProps}
              />
              <SettingsItem
                icon={Target}
                label={t('navigation.goals')}
                onPress={() => navigation.navigate('ObjectivesSettings')}
                {...itemProps}
                showDivider={false}
              />
            </View>
          </View>

          {/* Comunicación y Conexiones */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{t('settings.communicationTitle')}</Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <SettingsItem
                icon={Bell}
                label={t('settings.notificationsReminders')}
                onPress={() => navigation.navigate('NotificationsSettings')}
                {...itemProps}
              />
              <SettingsItem
                icon={Link}
                label={t('navigation.integrations')}
                onPress={() => navigation.navigate('ConnectedApps')}
                {...itemProps}
                showDivider={false}
              />
            </View>
          </View>

          {/* Contenido */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{t('settings.contentAllCaps')}</Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <SettingsItem
                icon={Dumbbell}
                label={t('settings.workout')}
                onPress={() => navigation.navigate('TrainingSettings')}
                {...itemProps}
              />
              <SettingsItem
                icon={Apple}
                label={t('tabs.nutrition')}
                onPress={() => navigation.navigate('NutritionSettings')}
                {...itemProps}
              />
              <SettingsItem
                icon={Heart}
                label={t('tabs.health')}
                onPress={() => navigation.navigate('HealthSettings')}
                {...itemProps}
                showDivider={false}
              />
            </View>
          </View>

          {/* Configuración */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{t('settings.configurationTitle')}</Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <SettingsItem
                icon={Shield}
                label={t('navigation.privacyData')}
                onPress={() => navigation.navigate('PrivacyData')}
                {...itemProps}
              />
              <SettingsItem
                icon={Palette}
                label={t('navigation.appearance')}
                onPress={() => navigation.navigate('AppearanceSettings')}
                {...itemProps}
                showDivider={false}
              />
            </View>
          </View>

          {/* Ayuda */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{t('settings.helpAllCaps')}</Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <SettingsItem
                icon={HelpCircle}
                label={t('navigation.support')}
                onPress={() => navigation.navigate('Support')}
                {...itemProps}
              />
              <SettingsItem
                icon={FileText}
                label={t('navigation.legal')}
                onPress={() => navigation.navigate('Legal')}
                {...itemProps}
                showDivider={false}
              />
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.logoContainer}>
              <Image source={iconA} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={[styles.version, dynamicStyles.version]}>Alzan Health v1.0.0</Text>
            <TouchableOpacity style={[styles.logoutButton, dynamicStyles.logoutButton]} onPress={handleLogout}>
              <LogOut size={18} color={colors.danger} />
              <Text style={[styles.logoutText, { color: colors.danger }]}>{t('settings.logout')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  contentContainer: {
    padding: spacing.m,
    paddingBottom: 120,
  },
  section: {
    marginBottom: spacing.m,
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
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.s,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.m,
  },
  itemLabel: {
    ...typography.body,
    flex: 1,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginLeft: 56, // iconContainer width + marginRight
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: spacing.m,
  },
  logoImage: {
    width: 80,
    height: 80,
    marginBottom: spacing.s,
  },
  version: {
    ...typography.caption,
    marginBottom: spacing.l,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.m,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
