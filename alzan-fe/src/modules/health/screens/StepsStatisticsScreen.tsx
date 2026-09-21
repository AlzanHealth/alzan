import React, { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { colors, typography } from '../../../theme';
import { HealthScreenNavigationProp, HealthStackParamList } from '../../../types/navigation.types';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { StepsChart, StepsChartHandle } from '../components/StepsChart';
import { useTabBarLayout } from '../../../navigation/tabBarLayout';

export const StepsStatisticsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const route = useRoute<RouteProp<HealthStackParamList, 'StepsStatistics'>>();
  const fromHome = route.params?.fromHome;
  const { styles: dynamicStyles, colors: themeColors } = useHealthStyles();
  const stepsChartRef = useRef<StepsChartHandle>(null);
  const { topFromScreenBottom } = useTabBarLayout();

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (fromHome) {
                navigation.navigate('Home');
              } else {
                navigation.goBack();
              }
            }}
            style={styles.backButton}
          >
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

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: topFromScreenBottom + 24 }]}>
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
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    padding: 8,
    marginLeft: -8,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  addButton: {
    width: 44,
    height: 44,
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
