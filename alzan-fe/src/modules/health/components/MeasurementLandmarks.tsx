import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { spacing, typography } from '../../../theme';
import femaleBodySilhouette from '../assets/female-body-silhouette-front.png';
import maleBodySilhouette from '../assets/male-body-silhouette-front.png';
import type { MeasurementSelection } from '../helpers/measurementProtocols';

type MeasurementLandmarksProps = {
  measurement: MeasurementSelection;
  sex?: 'male' | 'female' | null;
};

/** Public-domain OpenClipart body template with an overlay for the selected measurement. */
export const MeasurementLandmarks = ({ measurement, sex }: MeasurementLandmarksProps) => {
  const { t } = useTranslation();
  const { colors } = useHealthStyles();
  const isFemale = sex === 'female';
  const source = isFemale ? femaleBodySilhouette : maleBodySilhouette;

  const band = (() => {
    switch (measurement.key) {
      case 'chest':
        return { y: 150, from: 263, to: 355 };
      case 'waist':
        return { y: isFemale ? 203 : 180, from: isFemale ? 258 : 267, to: isFemale ? 370 : 358 };
      case 'abdomen':
        return { y: isFemale ? 226 : 207, from: isFemale ? 258 : 266, to: isFemale ? 370 : 359 };
      case 'hips':
        return { y: isFemale ? 278 : 257, from: isFemale ? 246 : 258, to: isFemale ? 380 : 369 };
      default:
        return null;
    }
  })();

  const armMarker = measurement.key === 'arm';
  const flexedArm = measurement.protocol === 'arm_flexed_max';
  const thighMarker = measurement.key === 'thigh';
  const markerColor = measurement.color;

  return (
    <View
      style={styles.container}
      accessibilityLabel={`${t('health.measurementLandmarks')}: ${t(measurement.labelKey)}`}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('health.measurementLandmarks')}</Text>
      <View style={styles.figureWrap}>
        <View style={styles.figure}>
          <Image source={source} resizeMode="contain" style={styles.bodyImage} accessible={false} />
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 600 600"
            preserveAspectRatio="xMidYMid meet"
            style={styles.markerOverlay}
            accessible={false}
          >
            {band && (
              <Path
                d={`M${band.from} ${band.y} Q310 ${band.y + 8} ${band.to} ${band.y}`}
                fill="none"
                stroke={markerColor}
                strokeWidth={15}
                strokeLinecap="round"
                opacity={0.95}
              />
            )}
            {armMarker && (
              <Ellipse
                cx={flexedArm ? 267 : 365}
                cy={flexedArm ? (isFemale ? 137 : 128) : isFemale ? 175 : 170}
                rx={flexedArm ? 17 : 13}
                ry={flexedArm ? 24 : 22}
                fill={markerColor + '40'}
                stroke={markerColor}
                strokeWidth={8}
              />
            )}
            {thighMarker && (
              <Ellipse
                cx={286}
                cy={isFemale ? 380 : 365}
                rx={17}
                ry={12}
                fill={markerColor + '40'}
                stroke={markerColor}
                strokeWidth={8}
              />
            )}
          </Svg>
        </View>
        <Text style={[styles.measurementName, { color: markerColor }]}>{t(measurement.labelKey)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginVertical: spacing.m, alignItems: 'center' },
  title: { ...typography.body, fontWeight: '600', marginBottom: spacing.s },
  figureWrap: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  figure: { width: 300, height: 300, maxWidth: '100%', alignItems: 'center', justifyContent: 'center' },
  bodyImage: { width: '100%', height: '100%', position: 'absolute' },
  markerOverlay: { position: 'absolute', zIndex: 2 },
  measurementName: { ...typography.body, fontWeight: '700', textAlign: 'center', marginTop: spacing.xs },
});
