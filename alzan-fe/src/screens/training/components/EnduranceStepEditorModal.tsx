import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '../../../theme';
import { useTheme } from '../../../context/ThemeContext';
import { Clock, Ruler, Heart, Activity } from 'lucide-react-native';
import { SimpleWheelPicker } from '../../../components/SimpleWheelPicker';
import { useUserPreferences } from '../../../hooks/useUserPreferences';
import { DurationType, PhaseType, TargetType } from '../../../types/requests.types';
import { useTranslation } from 'react-i18next';
import { getPhaseLabel } from '../helpers/phase.helper';

interface Step {
  id: string;
  progression_key?: string | null;
  phase_type: PhaseType;
  duration_type: DurationType;
  duration_s?: number;
  distance_m?: number;
  target_type: TargetType;
  target_min?: number;
  target_max?: number;
  repetitions: number;
  parent_step_id?: string | null;
  is_group: boolean;
  children?: Step[];
}

interface EnduranceStepEditorModalProps {
  visible: boolean;
  initialStep?: Step | null;
  onSave: (step: Step) => void;
  onCancel: () => void;
  sportType: string;
}

export const EnduranceStepEditorModal = ({
  visible,
  initialStep,
  onSave,
  onCancel,
  sportType,
}: EnduranceStepEditorModalProps) => {
  const { t } = useTranslation();
  // Hooks
  const { colors, isDark } = useTheme();
  const { preferences } = useUserPreferences();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 960;
  const useCenteredModal = isWideLayout && Platform.OS !== 'web';

  const dynamicStyles = {
    container: {
      backgroundColor: colors.background,
    },
    header: {
      borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    },
    title: {
      color: colors.textPrimary,
    },
    sectionLabel: {
      color: colors.textPrimary,
    },
    chip: {
      backgroundColor: isDark ? colors.cardBackground : '#F0F0F0',
    },
    segmentContainer: {
      backgroundColor: isDark ? colors.cardBackground : '#F0F0F0',
    },
    input: {
      backgroundColor: isDark ? colors.cardBackground : '#F0F0F0',
      color: colors.textPrimary,
    },
    suffixInputContainer: {
      backgroundColor: isDark ? colors.cardBackground : '#F0F0F0',
    },
    inputSuffix: {
      color: colors.textSecondary,
    },
    wheelSeparator: {
      color: colors.textPrimary,
    },
    zoneButton: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9F9F9',
    },
    zoneButtonActive: {
      backgroundColor: isDark ? 'rgba(33, 150, 243, 0.2)' : '#F0F8FF',
    },
    zoneTitle: {
      color: colors.textPrimary,
    },
  };

  // Derived Units
  const distanceUnit = preferences.distance_unit;
  const isMetricDist = distanceUnit === 'km';
  const paceUnitLabel = sportType === 'swimming' ? (isMetricDist ? '/100m' : '/100yd') : isMetricDist ? '/km' : '/mi';
  const speedUnitLabel = isMetricDist ? 'km/h' : 'mph';

  // Local State
  const [phase, setPhase] = useState<PhaseType>('interval');
  const [durationType, setDurationType] = useState<DurationType>('distance');

  // Distance Input State
  // We will use a single text input for "Major" unit (km or miles) + optional explicit meters if metric?
  // Legacy had separate km/m inputs.
  // For simplicity and standardization, let's use:
  // Metric: "Distance (km)" (float) OR keep independent "Metros" field for swimming?
  // Let's adapt:
  const [distMajor, setDistMajor] = useState<string>('0'); // km or miles
  const [distMinor, setDistMinor] = useState<string>('0'); // meters (only used if metric and user wants to add meters)

  const [durationHour, setDurationHour] = useState<string>('0'); // hours
  const [durationMin, setDurationMin] = useState<string>('00'); // minutes
  const [durationSec, setDurationSec] = useState<string>('00'); // seconds
  const [targetType, setTargetType] = useState<TargetType>('none');

  // Target Values
  const [paceMin, setPaceMin] = useState<string>('5');
  const [paceSec, setPaceSec] = useState<string>('30');
  const [zone, setZone] = useState<number>(2);
  // Speed State (km/h or mph)
  const [speedVal, setSpeedVal] = useState<string>('25');

  useEffect(() => {
    if (visible) {
      if (initialStep) {
        setPhase(initialStep.phase_type);
        setDurationType(initialStep.duration_type);

        // Load Distance
        const totalM = initialStep.distance_m || 1000;
        if (isMetricDist) {
          // Metric: Keep Km + M separation logic if desired, or just float Km
          setDistMajor(Math.floor(totalM / 1000).toString());
          setDistMinor((totalM % 1000).toString());
        } else {
          // Imperial: Convert meters to miles
          const miles = totalM * 0.000621371;
          setDistMajor(miles.toFixed(2));
          setDistMinor('0'); // Not used for imperial
        }

        // Parse duration to hr:min:sec
        const totalSecs = initialStep.duration_s || 0;
        setDurationHour(Math.floor(totalSecs / 3600).toString());
        setDurationMin(
          Math.floor((totalSecs % 3600) / 60)
            .toString()
            .padStart(2, '0'),
        );
        setDurationSec((totalSecs % 60).toString().padStart(2, '0'));
        setTargetType(initialStep.target_type);

        // Parse Target Values
        if (initialStep.target_type === 'pace' && initialStep.target_min) {
          const dbPaceSeconds = initialStep.target_min; // s/km (or s/100m for swim?) -> Assuming standardized s/km for Run/Cycle, s/100m for Swim?
          // Let's assume standardized DB:
          // Run/Cycle: seconds per KM
          // Swim: seconds per 100M
          // Convert to UI

          let uiPaceSeconds = dbPaceSeconds;
          if (sportType !== 'swimming' && !isMetricDist) {
            // s/km -> s/mi
            uiPaceSeconds = dbPaceSeconds * 1.60934;
          } else if (sportType === 'swimming' && !isMetricDist) {
            // s/100m -> s/100yd
            // 100m = 109.36 yd.
            // Pace is Time/Distance.
            // If I take 60s to swim 100m...
            // How long to swim 100yd?
            // 100yd is Shorter than 100m (100m = 109yd).
            // So time should be LESS.
            // Factor: s/100m * (100yd / 100m) ?
            // 100m = 1.0936 * 100yd.
            // So s/100yd = s/100m / 1.0936
            uiPaceSeconds = dbPaceSeconds / 1.09361;
          }

          const mins = Math.floor(uiPaceSeconds / 60);
          const secs = Math.round(uiPaceSeconds % 60);
          setPaceMin(mins.toString());
          setPaceSec(secs.toString().padStart(2, '0'));
        } else if (initialStep.target_type === 'speed' && initialStep.target_min) {
          // DB: m/s (Standardized) or km/h (Legacy)?
          // Existing app seems to save km/h raw.
          // Let's auto-detect? If value is > 20 it's likely km/h (running 20m/s is impossible).
          // But cycling 20 m/s (72km/h) is possible.
          // Let's assume Legacy was km/h.
          // convert to UI unit.
          let val = initialStep.target_min; // assuming km/h for legacy comp
          if (val < 15 && sportType === 'running') {
            // Might be m/s?
          }

          // If we standardize to m/s:
          // val_ms = initialStep.target_min;
          // ui_val = convertSpeedToUi(val_ms).value...

          // Assuming Legacy: raw km/h.
          if (!isMetricDist) {
            // km/h -> mph
            val = val * 0.621371;
          }
          setSpeedVal(Math.round(val).toString());
        } else if (initialStep.target_type === 'heart_rate' && initialStep.target_min) {
          setZone(initialStep.target_min);
        }
      } else {
        // Defaults
        setPhase('interval');
        setDurationType('distance');
        setDistMajor('1');
        setDistMinor('0');
        setDurationHour('0');
        setDurationMin('00');
        setDurationSec('00');
        setTargetType('none');
        setPaceMin(sportType === 'swimming' ? '2' : '5');
        setPaceSec('00');
        setZone(2);
        setSpeedVal(isMetricDist ? '25' : '15'); // 25kmh ~ 15mph
      }
    }
  }, [visible, initialStep, sportType, isMetricDist]);

  const handleSave = () => {
    const newStep: Step = {
      id: initialStep?.id || Math.random().toString(),
      progression_key: initialStep?.progression_key,
      phase_type: phase,
      duration_type: durationType,
      repetitions: 1, // Default for single step
      is_group: false,
      target_type: targetType,
      children: [],
    };

    if (durationType === 'distance') {
      const major = parseFloat(distMajor) || 0;
      const minor = parseFloat(distMinor) || 0;

      if (isMetricDist) {
        // Major=km, Minor=m
        newStep.distance_m = major * 1000 + minor;
      } else {
        // Major=miles. Minor ignored?
        newStep.distance_m = major * 1609.34;
      }
    } else if (durationType === 'time') {
      const hrs = parseInt(durationHour) || 0;
      const mins = parseInt(durationMin) || 0;
      const secs = parseInt(durationSec) || 0;
      newStep.duration_s = hrs * 3600 + mins * 60 + secs;
    }

    if (targetType === 'pace') {
      const mins = parseInt(paceMin) || 0;
      const secs = parseInt(paceSec) || 0;
      const totalUiSeconds = mins * 60 + secs;

      // Convert back to DB Standard (s/km or s/100m swim)
      let dbSeconds = totalUiSeconds;

      if (sportType !== 'swimming' && !isMetricDist) {
        // s/mi -> s/km
        dbSeconds = totalUiSeconds / 1.60934;
      } else if (sportType === 'swimming' && !isMetricDist) {
        // s/100yd -> s/100m
        // swimming 100m takes LONGER than 100yd
        dbSeconds = totalUiSeconds * 1.09361;
      }

      newStep.target_min = Math.round(dbSeconds);
      newStep.target_max = Math.round(dbSeconds);
    } else if (targetType === 'heart_rate') {
      newStep.target_min = zone;
      newStep.target_max = zone;
    } else if (targetType === 'speed') {
      const val = parseInt(speedVal) || 0;
      // Convert to Legacy KM/H (since that's what seemed to be used)?
      // Or m/s?
      // Let's stick to KM/H for now to avoid breaking existing sessions.
      let dbVal = val;
      if (!isMetricDist) {
        // mph -> km/h
        dbVal = val * 1.60934;
      }
      newStep.target_min = Math.round(dbVal);
      newStep.target_max = Math.round(dbVal);
    }

    onSave(newStep);
  };

  const modalContent = (
    <SafeAreaView style={[styles.container, dynamicStyles.container, useCenteredModal && styles.containerWide]}>
      <View style={[styles.header, dynamicStyles.header]}>
        <TouchableOpacity onPress={onCancel} style={styles.headerAction} accessibilityRole="button">
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, dynamicStyles.title]}>
          {initialStep ? t('training.editStep') : t('training.newStep')}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.headerAction}
          accessibilityRole="button"
          accessibilityLabel={t('common.save')}
        >
          <Text style={styles.saveText}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.editorScroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.sectionLabel, dynamicStyles.sectionLabel]}>{t('training.phaseType')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          {(['warmup', 'interval', 'recovery', 'cooldown'] as PhaseType[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.chip, dynamicStyles.chip, phase === p && { backgroundColor: getPhaseColor(p) }]}
              onPress={() => setPhase(p)}
              accessibilityRole="button"
              accessibilityState={{ selected: phase === p }}
            >
              <Text style={[styles.chipText, phase === p && styles.chipTextActive]}>{t(getPhaseLabel(p))}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Duration Type */}
        <Text style={[styles.sectionLabel, dynamicStyles.sectionLabel]}>{t('training.duration')}</Text>
        <View style={[styles.segmentContainer, dynamicStyles.segmentContainer]}>
          <TouchableOpacity
            style={[styles.segment, durationType === 'distance' && styles.segmentActive]}
            onPress={() => setDurationType('distance')}
          >
            <Ruler size={16} color={durationType === 'distance' ? '#FFF' : colors.textSecondary} />
            <Text style={[styles.segmentText, durationType === 'distance' && styles.segmentTextActive]}>
              {t('settings.distance')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, durationType === 'time' && styles.segmentActive]}
            onPress={() => setDurationType('time')}
          >
            <Clock size={16} color={durationType === 'time' ? '#FFF' : colors.textSecondary} />
            <Text style={[styles.segmentText, durationType === 'time' && styles.segmentTextActive]}>
              {t('alzan.time')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, durationType === 'lap_button' && styles.segmentActive]}
            onPress={() => setDurationType('lap_button')}
          >
            <Text style={[styles.segmentText, durationType === 'lap_button' && styles.segmentTextActive]}>
              {t('nutrition.manual')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Value Input */}
        {durationType === 'distance' && (
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>
              {t('settings.distance')}
              {sportType === 'swimming' && isMetricDist ? t('training.unitMetres') : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.m }}>
              {sportType !== 'swimming' && (
                <View style={{ flex: 1 }}>
                  <View style={[styles.suffixInputContainer, dynamicStyles.suffixInputContainer]}>
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      keyboardType="numeric"
                      value={distMajor}
                      onChangeText={setDistMajor}
                    />
                    <Text style={[styles.inputSuffix, dynamicStyles.inputSuffix]}>
                      {isMetricDist ? t('onboarding.unitKm') : t('onboarding.unitMi')}
                    </Text>
                  </View>
                </View>
              )}
              {/* Only show secondary 'm' input if Metric and NOT generic single input mode (which we are moving towards, but preserving km+m for metric users for now) */}
              {isMetricDist && (
                <View style={{ flex: 1 }}>
                  <View style={[styles.suffixInputContainer, dynamicStyles.suffixInputContainer]}>
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      keyboardType="numeric"
                      value={distMinor}
                      onChangeText={setDistMinor}
                    />
                    <Text style={[styles.inputSuffix, dynamicStyles.inputSuffix]}>m</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
        {durationType === 'time' && (
          <View style={[styles.inputContainer, { alignItems: 'center' }]}>
            <Text style={styles.inputLabel}>{t('training.timeHmsFormat')}</Text>
            <View style={styles.wheelContainer}>
              {/* Hours */}
              <SimpleWheelPicker
                items={Array.from({ length: 24 }, (_, i) => i.toString())}
                selectedValue={durationHour}
                onValueChange={setDurationHour}
              />
              <Text style={[styles.wheelSeparator, dynamicStyles.wheelSeparator]}>:</Text>

              {/* Minutes */}
              <SimpleWheelPicker
                items={Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))}
                selectedValue={durationMin}
                onValueChange={setDurationMin}
              />
              <Text style={[styles.wheelSeparator, dynamicStyles.wheelSeparator]}>:</Text>

              {/* Seconds */}
              <SimpleWheelPicker
                items={Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))}
                selectedValue={durationSec}
                onValueChange={setDurationSec}
              />
            </View>
            <Text style={styles.previewText}>
              {parseInt(durationHour) > 0 ? `${durationHour}h ` : ''}
              {durationMin}m {durationSec}s
            </Text>
          </View>
        )}

        {/* Target */}
        <Text style={[styles.sectionLabel, dynamicStyles.sectionLabel]}>{t('nutrition.goal')}</Text>
        <View style={[styles.segmentContainer, dynamicStyles.segmentContainer]}>
          <TouchableOpacity
            style={[styles.segment, targetType === 'none' && styles.segmentActive]}
            onPress={() => setTargetType('none')}
          >
            <Text style={[styles.segmentText, targetType === 'none' && styles.segmentTextActive]}>
              {t('training.none')}
            </Text>
          </TouchableOpacity>
          {sportType !== 'cycling' && (
            <TouchableOpacity
              style={[styles.segment, targetType === 'pace' && styles.segmentActive]}
              onPress={() => setTargetType('pace')}
            >
              <Activity size={16} color={targetType === 'pace' ? '#FFF' : colors.textSecondary} />
              <Text style={[styles.segmentText, targetType === 'pace' && styles.segmentTextActive]}>
                {t('training.pace')}
              </Text>
            </TouchableOpacity>
          )}
          {sportType === 'cycling' && (
            <TouchableOpacity
              style={[styles.segment, targetType === 'speed' && styles.segmentActive]}
              onPress={() => setTargetType('speed')}
            >
              <Activity size={16} color={targetType === 'speed' ? '#FFF' : colors.textSecondary} />
              <Text style={[styles.segmentText, targetType === 'speed' && styles.segmentTextActive]}>
                {t('training.speed')}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.segment, targetType === 'heart_rate' && styles.segmentActive]}
            onPress={() => setTargetType('heart_rate')}
          >
            <Heart size={16} color={targetType === 'heart_rate' ? '#FFF' : colors.textSecondary} />
            <Text style={[styles.segmentText, targetType === 'heart_rate' && styles.segmentTextActive]}>
              {t('training.hrZone')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Target Specific Inputs */}
        {targetType === 'pace' && (
          <View style={styles.targetContent}>
            <Text style={styles.helperText}>
              {sportType === 'swimming'
                ? `${t('training.selectTargetPace')} ${paceUnitLabel})`
                : `${t('training.selectTargetPaceObjective')} ${paceUnitLabel})`}
            </Text>
            <View style={styles.wheelContainer}>
              <SimpleWheelPicker
                items={
                  sportType === 'swimming'
                    ? Array.from({ length: 15 }, (_, i) => (i + 1).toString()) // 1 - 15 min for swim
                    : Array.from({ length: 15 }, (_, i) => (i + (isMetricDist ? 2 : 3)).toString()) // Shift range based on unit roughly?
                }
                selectedValue={paceMin}
                onValueChange={setPaceMin}
              />
              <Text style={[styles.wheelSeparator, dynamicStyles.wheelSeparator]}>:</Text>
              <SimpleWheelPicker
                items={Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))}
                selectedValue={paceSec}
                onValueChange={setPaceSec}
              />
              <Text style={styles.wheelLabel}>{paceUnitLabel}</Text>
            </View>
            <Text style={styles.previewText}>
              {t('training.pace')}
              {paceMin}'{paceSec}" {paceUnitLabel}
            </Text>
          </View>
        )}

        {targetType === 'speed' && (
          <View style={styles.targetContent}>
            <Text style={styles.helperText}>
              {t('training.selectTargetSpeed')}
              {speedUnitLabel})
            </Text>
            <View style={styles.wheelContainer}>
              <SimpleWheelPicker
                items={
                  isMetricDist
                    ? Array.from({ length: 60 }, (_, i) => (i + 10).toString()) // 10 - 70 km/h
                    : Array.from({ length: 40 }, (_, i) => (i + 5).toString()) // 5 - 45 mph
                }
                selectedValue={speedVal}
                onValueChange={setSpeedVal}
              />
              <Text style={styles.wheelLabel}>{speedUnitLabel}</Text>
            </View>
            <Text style={styles.previewText}>
              {t('training.speed')}
              {speedVal} {speedUnitLabel}
            </Text>
          </View>
        )}

        {targetType === 'heart_rate' && (
          <View style={styles.targetContent}>
            <Text style={styles.helperText}>{t('training.selectTrainingZone')}</Text>
            <View style={styles.zonesContainer}>
              {[1, 2, 3, 4, 5].map(z => (
                <TouchableOpacity
                  key={z}
                  style={[
                    styles.zoneButton,
                    dynamicStyles.zoneButton,
                    zone === z && [styles.zoneButtonActive, dynamicStyles.zoneButtonActive],
                    { borderColor: getZoneColor(z) },
                  ]}
                  onPress={() => setZone(z)}
                >
                  <View style={[styles.zoneBadge, { backgroundColor: getZoneColor(z) }]}>
                    <Text style={styles.zoneBadgeText}>Z{z}</Text>
                  </View>
                  <Text style={[styles.zoneTitle, dynamicStyles.zoneTitle]}>
                    {z === 1
                      ? t('training.recovery')
                      : z === 2
                        ? t('training.zoneAerobicEasy')
                        : z === 3
                          ? t('training.zoneAerobicModerate')
                          : z === 4
                            ? t('training.zoneThreshold')
                            : t('training.zoneMaximum')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );

  return (
    <Modal
      visible={visible}
      animationType={useCenteredModal ? 'fade' : 'slide'}
      transparent={useCenteredModal}
      presentationStyle={useCenteredModal ? 'overFullScreen' : 'pageSheet'}
      onRequestClose={onCancel}
    >
      {useCenteredModal ? (
        <Pressable style={[styles.modalShell, styles.modalOverlay]} onPress={onCancel}>
          <Pressable style={[styles.modalSurface, styles.modalSurfaceWide]} onPress={event => event.stopPropagation()}>
            {modalContent}
          </Pressable>
        </Pressable>
      ) : (
        modalContent
      )}
    </Modal>
  );
};

// Helpers
const getZoneColor = (zone: number) => {
  switch (zone) {
    case 1:
      return '#9E9E9E'; // Grey/Recup
    case 2:
      return '#2196F3'; // Blue/Aerobic
    case 3:
      return '#4CAF50'; // Green/Tempo
    case 4:
      return '#FF9800'; // Orange/Threshold
    case 5:
      return '#F44336'; // Red/Anaerobic
    default:
      return colors.primary;
  }
};

// Phase colors matching EnduranceWorkoutBuilderScreen
const getPhaseColor = (phase: PhaseType) => {
  switch (phase) {
    case 'warmup':
      return colors.success;
    case 'interval':
      return colors.danger;
    case 'recovery':
      return colors.textSecondary;
    case 'cooldown':
      return colors.accent;
    default:
      return colors.primary;
  }
};

const styles = StyleSheet.create({
  modalShell: {
    flex: 1,
  },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  modalSurface: {
    flex: 1,
  },
  modalSurfaceWide: {
    flex: 0,
    width: '100%',
    maxWidth: 560,
    height: '84%',
    borderRadius: borderRadius.l,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  containerWide: {
    borderRadius: borderRadius.l,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  headerAction: {
    minWidth: 72,
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelText: { ...typography.body, color: colors.danger },
  saveText: { ...typography.body, color: colors.primary, fontWeight: 'bold' },
  title: { ...typography.h4, fontWeight: 'bold' },
  editorScroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: { padding: spacing.m, paddingBottom: 40 },
  sectionLabel: { ...typography.body, fontWeight: '600', marginBottom: spacing.s, marginTop: spacing.m },
  chipsScroll: { flexDirection: 'row', marginBottom: spacing.m },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: borderRadius.full,
    marginRight: 8,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#FFFFFF' },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: borderRadius.m,
    padding: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: borderRadius.s,
    gap: 4,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  segmentTextActive: { color: '#FFFFFF' },
  inputContainer: { marginTop: spacing.m },
  inputLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: '#F0F0F0',
    padding: spacing.m,
    borderRadius: borderRadius.m,
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 40,
  },
  suffixInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.m,
  },
  inputSuffix: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
  targetContent: { marginTop: spacing.m, alignItems: 'center' },
  helperText: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.m },
  wheelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.m,
  },
  wheelSeparator: {
    ...typography.h3,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  wheelLabel: {
    ...typography.body,
    color: colors.textSecondary,
    marginLeft: spacing.s,
  },
  previewText: {
    marginTop: spacing.m,
    ...typography.h4,
    fontWeight: 'bold',
    color: colors.primary,
  },
  zonesContainer: {
    width: '100%',
    gap: spacing.s,
  },
  zoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    borderRadius: borderRadius.m,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  zoneButtonActive: {
    backgroundColor: '#F0F8FF',
    borderWidth: 2,
  },
  zoneBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.m,
  },
  zoneBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  zoneTitle: {
    ...typography.body,
    fontWeight: '600',
  },
});
