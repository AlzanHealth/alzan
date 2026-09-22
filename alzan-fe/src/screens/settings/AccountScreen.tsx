import React from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { spacing, typography, borderRadius } from '../../theme';
import { supabase } from '../../lib/supabaseClient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SettingsStackParamList } from '../../navigation/SettingsNavigator';
import { LogOut, Key, Trash2 } from 'lucide-react-native';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

export const AccountScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<StackNavigationProp<SettingsStackParamList>>();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useSettingsStyles();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Error', error.message);
    }
    // Auth state listener in root should handle navigation to Login
  };

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
            {t('settings.sessionAndSecurity')}
          </Text>

          <TouchableOpacity
            style={[styles.item, dynamicStyles.card]}
            onPress={() => Alert.alert(t('settings.comingSoonCaps'), t('settings.changePasswordComingSoon'))}
          >
            <Key size={20} color={themeColors.primary} style={styles.icon} />
            <Text style={[styles.itemText, { color: themeColors.textPrimary }]}>{t('settings.changePassword')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.item, dynamicStyles.card]} onPress={handleLogout}>
            <LogOut size={20} color={themeColors.textPrimary} style={styles.icon} />
            <Text style={[styles.itemText, { color: themeColors.textPrimary }]}>{t('settings.logout')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>{t('settings.dangerZone')}</Text>
          <TouchableOpacity
            style={[
              styles.item,
              styles.destructiveItem,
              isDark && { backgroundColor: 'rgba(255,69,58,0.1)', borderColor: 'rgba(255,69,58,0.3)' },
            ]}
            onPress={() => navigation.navigate('DeleteAccount')}
          >
            <Trash2 size={20} color={themeColors.danger} style={styles.icon} />
            <Text style={[styles.itemText, styles.destructiveText, { color: themeColors.danger }]}>
              {t('settings.deleteAccount')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Background handled by LinearGradient
  },
  scrollView: {
    flex: 1,
  },
  content: {
    ...formLayout.settings,
    padding: spacing.m,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.caption,
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    borderRadius: borderRadius.m,
    marginBottom: spacing.s,
  },
  destructiveItem: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  icon: {
    marginRight: spacing.m,
  },
  itemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  destructiveText: {
    // color handled dynamically
  },
});
