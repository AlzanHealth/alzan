import { useNavigation } from '@react-navigation/native';
import { ChevronRight, HeartPulse } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import type { HealthScreenNavigationProp } from '../../../types/navigation.types';

export const CardioEvolutionCard = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const { styles: healthStyles, colors } = useHealthStyles();

  return (
    <GlassCard style={[styles.card, healthStyles.glassCard]}>
      <Pressable
        onPress={() => navigation.navigate('CardioEvolution')}
        style={styles.pressable}
        accessibilityRole="button"
        accessibilityLabel={`${t('health.cardioTitle')}. ${t('health.cardioCardOpen')}`}
      >
        <View style={[styles.icon, { backgroundColor: `${colors.primary}18` }]}>
          <HeartPulse size={20} color={colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, healthStyles.title]}>{t('health.cardioTitle')}</Text>
          <Text style={[styles.description, healthStyles.subtitle]}>{t('health.cardioCardDescription')}</Text>
        </View>
        <View style={styles.action}>
          <Text style={[styles.actionLabel, { color: colors.primary }]}>{t('health.cardioCardOpen')}</Text>
          <ChevronRight size={18} color={colors.primary} />
        </View>
      </Pressable>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: { marginTop: 24, padding: 0, borderRadius: 20 },
  pressable: { minHeight: 92, flexDirection: 'row', alignItems: 'center', padding: 15, gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 17 },
  action: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  actionLabel: { fontSize: 11, fontWeight: '600' },
});
