import React, { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { colors, typography } from '../../../theme';
import { HealthScreenNavigationProp } from '../../../types/navigation.types';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { StepsChart, StepsChartHandle } from '../components/StepsChart';

export const StepsStatisticsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const { styles: dynamicStyles, colors: themeColors } = useHealthStyles();
  const stepsChartRef = useRef<StepsChartHandle>(null);

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ChevronLeft size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.title]}>{t('home.steps')}</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('StepsAdd')}
            style={[styles.addButton, { backgroundColor: themeColors.primary }]}
            accessibilityLabel={t('steps.addTitle')}
          >
            <Plus size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Pressable style={styles.clearSelectionLayer} onPress={() => stepsChartRef.current?.clearSelection()}>
            <StepsChart ref={stepsChartRef} />
          </Pressable>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    padding: 20,
  },
  clearSelectionLayer: {
    flexGrow: 1,
  },
});
