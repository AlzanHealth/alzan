import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useHealthStyles } from '../../../hooks/useHealthStyles';

export type HealthTimeRange = 'S' | 'M' | '6M' | 'A';

const periods = [
  { value: 'S', label: 'health.periodWeek' },
  { value: 'M', label: 'health.periodMonth' },
  { value: '6M', label: 'health.periodSixMonths' },
  { value: 'A', label: 'health.periodYear' },
] as const;

export function HealthPeriodSelector({
  value,
  onChange,
}: {
  value: HealthTimeRange;
  onChange: (value: HealthTimeRange) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useHealthStyles();
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('health.chartPeriod')}</Text>
      <View style={[styles.options, { backgroundColor: colors.background }]}>
        {periods.map(period => (
          <Pressable
            key={period.value}
            accessibilityRole="button"
            accessibilityState={{ selected: value === period.value }}
            onPress={() => onChange(period.value)}
            style={[
              styles.option,
              {
                borderColor: value === period.value ? colors.primary : 'transparent',
                backgroundColor: value === period.value ? colors.surfaceSolid : 'transparent',
              },
            ]}
          >
            <Text style={[styles.text, { color: colors.textPrimary }, value === period.value && styles.selected]}>
              {t(period.label)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20, gap: 8 },
  label: { fontSize: 13, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', padding: 3, gap: 3, borderRadius: 12 },
  option: {
    flexGrow: 1,
    flexBasis: 52,
    minHeight: 44,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 13, textAlign: 'center', flexShrink: 1 },
  selected: { fontWeight: '700' },
});
