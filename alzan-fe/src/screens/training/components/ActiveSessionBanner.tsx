import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { TrainingScreenNavigationProp } from '../../../types/navigation.types';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../../theme';
import { Play, Activity } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivitySession } from '../../../types/requests.types';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDate } from '../../../i18n/dateLocale';
import { formatDurationTime } from '../../../utils/unitConversionUtils';

interface ActiveSessionBannerProps {
  session: ActivitySession;
}

export const ActiveSessionBanner = ({ session }: ActiveSessionBannerProps) => {
  const { t } = useTranslation();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!session?.id) return;

    // Poll AsyncStorage to sync with ActiveWorkoutScreen
    const pollDuration = async () => {
      try {
        const stored = await AsyncStorage.getItem(`active_session_duration_${session.id}`);
        const currentDuration = stored ? parseInt(stored, 10) : 0;
        setDuration(currentDuration);
      } catch (_error) {
        // Silent fail
      }
    };

    pollDuration();
    const intervalId = setInterval(pollDuration, 1000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [session?.id]);

  const formatTime = formatDurationTime;

  if (!session) return null;

  const formattedDate = session.start_time
    ? formatLocalizedDate(new Date(session.start_time), {
        en: 'EEEE, MMMM d • HH:mm',
        es: "EEEE d 'de' MMMM • HH:mm",
      })
    : '';

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => navigation.navigate('ActiveWorkout', { sessionId: session.id })}
      style={styles.container}
    >
      <LinearGradient
        colors={['#007AFF', '#0A84FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View style={styles.badge}>
            <Activity size={12} color="#FFF" />
            <Text style={styles.badgeText}>{t('training.inProgress')}</Text>
          </View>
          <Text style={styles.timer}>{formatTime(duration)}</Text>
        </View>

        <View style={styles.mainContent}>
          <Text style={styles.name} numberOfLines={1}>
            {session.name || t('settings.workout')}
          </Text>

          <View style={styles.footer}>
            <Text style={styles.date}>{formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}</Text>

            <View style={styles.resumeButton}>
              <Text style={styles.resumeText}>{t('training.resume')}</Text>
              <View style={styles.iconCircle}>
                <Play size={12} color={colors.primary} fill={colors.primary} />
              </View>
            </View>
          </View>
        </View>

        {/* Decorative background elements */}
        <View style={styles.circle1} />
        <View style={styles.circle2} />
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 24,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  gradient: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timer: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  mainContent: {
    gap: 4,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: -0.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  date: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    marginBottom: 4,
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 8,
  },
  resumeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Decorative circles
  circle1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  circle2: {
    position: 'absolute',
    bottom: -40,
    left: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
});
