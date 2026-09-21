import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { HealthScreenNavigationProp } from '../../../types/navigation.types';
import { ChevronLeft } from 'lucide-react-native';
import { colors, typography } from '../../../theme';
import { HealthInteractiveChart } from '../components/HealthInteractiveChart';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTabBarLayout } from '../../../navigation/tabBarLayout';

export const HealthStatisticsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const { topFromScreenBottom } = useTabBarLayout();
  const { styles: dynamicStyles, colors: themeColors } = useHealthStyles();

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ChevronLeft size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.title]}>{t('health.advancedStats')}</Text>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: topFromScreenBottom + 24 }]}>
          <HealthInteractiveChart />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    padding: 8,
    marginRight: 8,
    marginLeft: -8,
  },
  title: {
    flexShrink: 1,
    ...typography.h3,
    color: colors.textPrimary,
  },
  content: {
    padding: 20,
  },
});
