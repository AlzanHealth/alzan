import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import type { HealthScreenNavigationProp } from '../../../types/navigation.types';
import { CardioEvolutionSection } from '../components/CardioEvolutionSection';

export const CardioEvolutionScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const { styles: healthStyles, colors } = useHealthStyles();

  return (
    <LinearGradient colors={healthStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.backButton, healthStyles.iconContainer]}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={21} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.topBarTitle, healthStyles.title]}>{t('health.cardioScreenTitle')}</Text>
          <View style={styles.backButton} />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <CardioEvolutionSection />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  topBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 10 },
  backButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600' },
  content: { paddingHorizontal: 18, paddingBottom: 120 },
});
