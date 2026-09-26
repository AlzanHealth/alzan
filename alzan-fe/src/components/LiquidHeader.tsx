import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import { colors, spacing, typography } from '../theme';

interface LiquidHeaderProps {
  title: string;
  onBack?: () => void;
  rightComponent?: React.ReactNode;
  subtitle?: string;
}

export const LiquidHeader: React.FC<LiquidHeaderProps> = ({ title, onBack, rightComponent, subtitle }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      {/* Glass effect - same as TabNavigator */}
      <BlurView intensity={30} tint="light" style={styles.blurContainer}>
        {/* Layer 1: Base reflection */}
        <LinearGradient
          colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.1)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Layer 2: Subtle heavy bottom reflection for volume */}
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.2)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Border effect (Inner shadow simulation) */}
        <View style={styles.borderOverlay} pointerEvents="none" />

        {/* Content */}
        <View style={styles.content}>
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <ArrowLeft size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          )}

          <View style={styles.titleContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>

          {rightComponent && <View style={styles.rightComponent}>{rightComponent}</View>}
        </View>
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 50, // Safe area offset
    marginBottom: spacing.m,
    height: 70,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 15,
    borderRadius: 35,
    zIndex: 100,
  },
  blurContainer: {
    flex: 1,
    borderRadius: 35,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.15)', // Liquid water look
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 35,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    zIndex: 10,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    zIndex: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rightComponent: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
});
