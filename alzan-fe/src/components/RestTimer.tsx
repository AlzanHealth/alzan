import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import { colors, typography, borderRadius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { X, Plus, SkipForward } from 'lucide-react-native';
import { LiquidGlassFooter } from './common/LiquidGlassFooter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import beepSound from '../../assets/sounds/beep.mp3';

import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import { useTranslation } from 'react-i18next';
import { formatDurationTime } from '../utils/unitConversionUtils';

interface RestTimerProps {
  initialSeconds: number;
  onComplete: () => void;
  onDismiss: () => void;
  isVisible: boolean;
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
  bottomOffset?: number;
}

export const RestTimer: React.FC<RestTimerProps> = ({
  initialSeconds,
  onComplete,
  onDismiss,
  isVisible,
  soundEnabled = true,
  vibrationEnabled = true,
  bottomOffset,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const [audioReady, setAudioReady] = useState(false);

  // Initialize audio player imperatively with error handling
  useEffect(() => {
    let isMounted = true;

    const initAudio = async () => {
      try {
        // Set audio mode first
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });

        // Create audio player imperatively (not a hook)
        const player = createAudioPlayer(beepSound);

        if (isMounted) {
          playerRef.current = player;
          setAudioReady(true);
        } else {
          // Component unmounted during init, release immediately
          player.release();
        }
      } catch (error) {
        console.log('Error initializing audio (RestTimer):', error);
        // Fail silently - app continues without sound
      }
    };

    initAudio();

    return () => {
      isMounted = false;
      if (playerRef.current) {
        try {
          playerRef.current.release();
        } catch (e) {
          console.log('Error releasing audio player:', e);
        }
        playerRef.current = null;
      }
    };
  }, []);

  const playSound = async () => {
    if (!audioReady || !playerRef.current) return;
    try {
      playerRef.current.seekTo(0);
      playerRef.current.play();
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  };

  const vibrate = (pattern?: number | number[]) => {
    try {
      Vibration.vibrate(pattern);
    } catch (e) {
      console.log('Vibration error:', e);
    }
  };

  useEffect(() => {
    if (isVisible) {
      setSecondsLeft(initialSeconds);
    }
  }, [isVisible, initialSeconds]);

  const onCompleteRef = useRef(onComplete);
  const soundEnabledRef = useRef(soundEnabled);
  const vibrationEnabledRef = useRef(vibrationEnabled);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    soundEnabledRef.current = soundEnabled;
    vibrationEnabledRef.current = vibrationEnabled;
  }, [onComplete, soundEnabled, vibrationEnabled]);

  useEffect(() => {
    if (!isVisible) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Feedback at START
    if (vibrationEnabledRef.current) {
      vibrate(200);
    }
    if (soundEnabledRef.current) {
      playSound();
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);

          // Feedback at END
          if (vibrationEnabledRef.current) {
            vibrate([0, 500, 200, 500]);
          }
          if (soundEnabledRef.current) {
            playSound();
          }

          setTimeout(() => {
            onCompleteRef.current();
          }, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isVisible]);

  const addTime = (amount: number) => {
    setSecondsLeft(prev => prev + amount);
  };

  if (!isVisible) return null;

  const resolvedBottomOffset = bottomOffset ?? 40 + insets.bottom;

  const dynamicStyles = {
    title: { color: colors.textPrimary },
    timerText: { color: colors.primary },
    button: { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
    buttonText: { color: colors.primary },
  };

  return (
    <View style={[styles.overlay, { bottom: resolvedBottomOffset }]}>
      <LiquidGlassFooter style={styles.card} borderRadius={30}>
        <View style={styles.header}>
          <Text style={[styles.title, dynamicStyles.title]}>{t('common.rest')}</Text>
          <TouchableOpacity onPress={onDismiss}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.timerContainer}>
          <Text style={[styles.timerText, dynamicStyles.timerText]}>{formatDurationTime(secondsLeft)}</Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={[styles.button, dynamicStyles.button]} onPress={() => addTime(30)}>
            <Plus size={16} color={colors.primary} />
            <Text style={[styles.buttonText, dynamicStyles.buttonText]}>{t('common.add30s')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.skipButton]} onPress={onDismiss}>
            <SkipForward size={16} color={colors.white} />
            <Text style={[styles.buttonText, { color: colors.white }]}>{t('common.skip')}</Text>
          </TouchableOpacity>
        </View>
      </LiquidGlassFooter>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: spacing.m,
    right: spacing.m,
    zIndex: 1000,
  },
  card: {
    width: '100%',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  title: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  timerContainer: {
    alignItems: 'center',
    marginVertical: spacing.s,
  },
  timerText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.s,
    gap: spacing.m,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: spacing.s,
    borderRadius: borderRadius.m,
    gap: 4,
  },
  skipButton: {
    backgroundColor: colors.primary,
  },
  buttonText: {
    ...typography.button,
    color: colors.primary,
  },
});
