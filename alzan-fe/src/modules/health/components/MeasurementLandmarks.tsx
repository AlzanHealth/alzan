import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { typography, spacing } from '../../../theme';

/** Front view: waist tape sits immediately above the marked upper hipbones. */
export const MeasurementLandmarks = () => {
  const { t } = useTranslation();
  const { colors } = useHealthStyles();
  return (
    <View style={styles.container} accessibilityLabel={t('health.measurementLandmarks')}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('health.measurementLandmarks')}</Text>
      <View style={styles.diagram}>
        <Svg width={110} height={180} viewBox="0 0 110 180" accessible={false}>
          <Path
            d="M29 8 Q55 20 81 8 L91 43 Q77 65 80 87 Q94 112 88 139 L75 173 M35 173 L22 139 Q16 112 30 87 Q33 65 19 43 Z"
            fill={colors.primary + '12'}
            stroke={colors.textSecondary}
            strokeWidth={2}
          />
          <Path d="M30 81 Q36 73 42 81 M68 81 Q74 73 80 81" fill="none" stroke={colors.textSecondary} strokeWidth={2} />
          <Circle cx={55} cy={96} r={3} fill={colors.textSecondary} />
          <Line x1={26} x2={84} y1={73} y2={73} stroke={colors.primary} strokeWidth={3} />
          <Line x1={27} x2={83} y1={96} y2={96} stroke={colors.primary} strokeWidth={2} strokeDasharray="5 3" />
          <Line x1={19} x2={91} y1={126} y2={126} stroke={colors.primary} strokeWidth={3} />
          <Line x1={84} x2={107} y1={73} y2={73} stroke={colors.textSecondary} />
          <Line x1={83} x2={107} y1={96} y2={96} stroke={colors.textSecondary} />
          <Line x1={91} x2={107} y1={126} y2={126} stroke={colors.textSecondary} />
        </Svg>
        <View style={styles.labels}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('health.waistLandmark')}</Text>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('health.abdomenLandmark')}</Text>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('health.hipsLandmark')}</Text>
        </View>
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  container: { marginVertical: spacing.m },
  title: { ...typography.body, fontWeight: '600', marginBottom: spacing.s },
  diagram: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  labels: { flex: 1, gap: spacing.m },
  label: { ...typography.caption },
});
