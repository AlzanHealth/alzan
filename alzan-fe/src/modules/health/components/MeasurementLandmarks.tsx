import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { spacing, typography } from '../../../theme';
import maleRelaxed from '../assets/measurement-male-relaxed.png';
import maleFlexed from '../assets/measurement-male-flexed.png';
import femaleRelaxed from '../assets/measurement-female-relaxed.png';
import femaleFlexed from '../assets/measurement-female-flexed.png';
import type { MeasurementSelection } from '../helpers/measurementProtocols';

type MeasurementLandmarksProps = {
  measurement: MeasurementSelection;
  sex?: 'male' | 'female' | null;
};

type Band = { path: string; width: number };

const BODY_VIEWBOX = '0 0 1086 1448';

/** Overlay marks the actual tape path on the supplied Alzan body illustrations. */
export const MeasurementLandmarks = ({ measurement, sex }: MeasurementLandmarksProps) => {
  const { t } = useTranslation();
  const { colors } = useHealthStyles();
  const isFemale = sex === 'female';
  const isFlexedArm = measurement.key === 'arm' && measurement.protocol === 'arm_flexed_max';
  const source = isFemale ? (isFlexedArm ? femaleFlexed : femaleRelaxed) : isFlexedArm ? maleFlexed : maleRelaxed;

  const band: Band | null = (() => {
    switch (measurement.key) {
      case 'chest':
        return { path: 'M340 383 Q543 408 746 383', width: 16 };
      case 'waist':
        return { path: 'M402 615 Q543 635 684 615', width: 16 };
      case 'abdomen':
        return { path: 'M414 557 Q543 577 672 557', width: 16 };
      case 'hips':
        return { path: 'M380 711 Q543 737 706 711', width: 16 };
      case 'thigh':
        return { path: 'M387 850 Q460 862 533 850', width: 14 };
      case 'arm':
        return null;
      default:
        return null;
    }
  })();

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
            viewBox={BODY_VIEWBOX}
            preserveAspectRatio="xMidYMid meet"
            style={styles.markerOverlay}
            accessible={false}
          >
            {band && (
              <>
                <Path d={band.path} fill="none" stroke="#FFFFFF" strokeWidth={band.width + 10} strokeLinecap="round" />
                <Path
                  d={band.path}
                  fill="none"
                  stroke={measurement.color}
                  strokeWidth={band.width}
                  strokeLinecap="round"
                />
              </>
            )}
            {measurement.key === 'arm' && (
              <>
                <Path
                  d={isFlexedArm ? 'M320 286 L320 379' : 'M678 425 L740 425'}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={14}
                  strokeLinecap="round"
                />
                <Path
                  d={isFlexedArm ? 'M320 286 L320 379' : 'M678 425 L740 425'}
                  fill="none"
                  stroke={measurement.color}
                  strokeWidth={7}
                  strokeLinecap="round"
                />
              </>
            )}
          </Svg>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginVertical: spacing.m, alignItems: 'center' },
  title: { ...typography.body, fontWeight: '600', marginBottom: spacing.s },
  figureWrap: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  figure: { width: 280, maxWidth: '100%', aspectRatio: 760 / 1013, alignItems: 'center', justifyContent: 'center' },
  bodyImage: { width: '100%', height: '100%', position: 'absolute' },
  markerOverlay: { position: 'absolute', zIndex: 2 },
});
