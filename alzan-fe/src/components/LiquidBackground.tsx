import React from 'react';
import { StyleSheet, View, Platform, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../context/ThemeContext';

interface LiquidBackgroundProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  intensity?: number;
}

/**
 * LiquidBackground - Controlled glass background
 *
 * Uses BlurView on every platform to avoid native glass highlight artifacts
 * that were leaking as bright rectangular patches inside cards and modals.
 */
export const LiquidBackground: React.FC<LiquidBackgroundProps> = ({
  children,
  style,
  borderRadius = 40,
  intensity = 30,
}) => {
  const { isDark } = useTheme();

  // Extract alignment and content styles to apply to the inner content View
  const flatStyle = StyleSheet.flatten(style) || {};
  const {
    flexDirection,
    flexWrap,
    alignContent,
    alignItems,
    justifyContent,
    padding,
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    paddingHorizontal,
    paddingVertical,
    gap,
    rowGap,
    columnGap,
    ...containerStyle
  } = flatStyle;

  const contentStyle = {
    flexDirection,
    flexWrap,
    alignContent,
    alignItems,
    justifyContent,
    padding,
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    paddingHorizontal,
    paddingVertical,
    gap,
    rowGap,
    columnGap,
  };

  // Liquid Glass Effect - Higher opacity for much better content readability
  // Based on Apple's Liquid Glass design: more solid background, subtle highlight
  const bgColor = isDark ? 'rgba(28, 28, 30, 0.8)' : 'rgba(255, 255, 255, 0.88)';
  const highlightColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.65)';

  const blurIntensity = Platform.OS === 'ios' ? Math.max(intensity, 50) : intensity;

  return (
    <View style={[styles.container, containerStyle, { borderRadius }]}>
      {/* Blur Layer */}
      <BlurView
        intensity={blurIntensity}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />

      {/* Glass Overlay */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: bgColor,
            borderRadius,
          },
        ]}
        pointerEvents="none"
      />

      {/* Specular Highlight */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            borderWidth: 1,
            borderColor: highlightColor,
            opacity: 0.5,
          },
        ]}
        pointerEvents="none"
      />

      {/* Content */}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  content: {
    flexGrow: 1, // Allow growing (updates from flex: 1)
    zIndex: 10,
  },
});
