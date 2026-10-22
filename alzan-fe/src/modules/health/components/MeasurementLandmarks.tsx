import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { typography, spacing } from '../../../theme';

/** Front view: waist tape sits immediately above the marked upper hipbones. */
interface MeasurementLandmarksProps {
  sex?: 'male' | 'female' | null;
}

export const MeasurementLandmarks = ({ sex }: MeasurementLandmarksProps) => {
  const { t } = useTranslation();
  const { colors } = useHealthStyles();
  const isFemale = sex === 'female';
  const outline = isFemale
    ? 'M35 8 Q55 20 75 8 L86 44 Q74 63 77 83 Q94 108 91 138 L76 173 M34 173 L19 138 Q16 108 33 83 Q36 63 24 44 Z'
    : 'M24 8 Q55 18 86 8 L94 44 Q80 63 82 85 Q91 108 90 138 L76 173 M34 173 L20 138 Q19 108 28 85 Q30 63 16 44 Z';
  const waistBounds = isFemale ? [31, 79] : [28, 82];
  const navelBounds = isFemale ? [33, 77] : [28, 82];
  const hipsBounds = isFemale ? [19, 91] : [20, 90];
  return (
    <View style={styles.container} accessibilityLabel={t('health.measurementLandmarks')}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('health.measurementLandmarks')}</Text>
      <View style={styles.diagram}>
        <Svg width={110} height={180} viewBox="0 0 110 180" accessible={false}>
          <Path d={outline} fill={colors.primary + '12'} stroke={colors.textSecondary} strokeWidth={2} />
          <Path d="M30 81 Q36 73 42 81 M68 81 Q74 73 80 81" fill="none" stroke={colors.textSecondary} strokeWidth={2} />
          <Circle cx={55} cy={96} r={3} fill={colors.textSecondary} />
          <Line x1={waistBounds[0]} x2={waistBounds[1]} y1={73} y2={73} stroke={colors.primary} strokeWidth={3} />
          <Line
            x1={navelBounds[0]}
            x2={navelBounds[1]}
            y1={96}
            y2={96}
            stroke={colors.primary}
            strokeWidth={2}
            strokeDasharray="5 3"
          />
          <Line x1={hipsBounds[0]} x2={hipsBounds[1]} y1={126} y2={126} stroke={colors.primary} strokeWidth={3} />
          <Line x1={waistBounds[1]} x2={107} y1={73} y2={73} stroke={colors.textSecondary} />
          <Line x1={navelBounds[1]} x2={107} y1={96} y2={96} stroke={colors.textSecondary} />
          <Line x1={hipsBounds[1]} x2={107} y1={126} y2={126} stroke={colors.textSecondary} />
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
