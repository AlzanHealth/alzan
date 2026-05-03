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
import { HealthExportModal } from '../components/HealthExportModal';
import { useHealthPdfExport } from '../hooks/useHealthPdfExport';

export const HealthStatisticsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const { styles: dynamicStyles, colors: themeColors } = useHealthStyles();
  const healthExport = useHealthPdfExport();

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ChevronLeft size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.title]}>{t('health.advancedStats')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <HealthInteractiveChart onExportPress={healthExport.openModal} isExporting={healthExport.isExporting} />
        </ScrollView>
        <HealthExportModal controller={healthExport} />
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
    padding: 8,
    marginRight: 8,
    marginLeft: -8,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  content: {
    padding: 20,
  },
});
