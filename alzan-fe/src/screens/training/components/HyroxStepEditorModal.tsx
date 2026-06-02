import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, Dumbbell, Ruler, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../context/ThemeContext';
import { colors, spacing, borderRadius } from '../../../theme';
import { BuilderStep } from '../../../hooks/useEnduranceWorkoutBuilder';
import { SportCatalogOption } from '../../../hooks/useSportCatalog';

type HyroxStepType = 'run' | 'station' | 'rest';

interface HyroxStepEditorModalProps {
  visible: boolean;
  initialStep?: BuilderStep | null;
  stationOptions: SportCatalogOption[];
  getStationLabel: (key: string | null | undefined) => string;
  onSave: (step: BuilderStep) => void;
  onCancel: () => void;
}

const parseNumber = (value: string): number | null => {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatNumericValue = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

export const HyroxStepEditorModal = ({
  visible,
  initialStep,
  stationOptions,
  getStationLabel,
  onSave,
  onCancel,
}: HyroxStepEditorModalProps) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 960;
  const useCenteredModal = isWideLayout && Platform.OS !== 'web';

  const [stepType, setStepType] = useState<HyroxStepType>('run');
  const [stationKey, setStationKey] = useState<string | null>(null);
  const [distanceM, setDistanceM] = useState('1000');
  const [durationMin, setDurationMin] = useState('');
  const [paceMin, setPaceMin] = useState('');
  const [paceSec, setPaceSec] = useState('');
  const [loadKg, setLoadKg] = useState('');
  const [reps, setReps] = useState('');

  useEffect(() => {
    if (!visible) return;

    const initialType = (initialStep?.hyrox_step_type as HyroxStepType | undefined) || 'run';
    setStepType(initialType);
    setStationKey(initialStep?.hyrox_station_key || stationOptions[0]?.option_key || null);
    setDistanceM(formatNumericValue(initialStep?.distance_m) || (initialType === 'run' ? '1000' : ''));
    setDurationMin(
      initialStep?.duration_s
        ? String(Math.round((initialStep.duration_s || 0) / 60))
        : initialType === 'rest'
          ? '2'
          : '',
    );

    if (initialStep?.target_type === 'pace' && initialStep.target_min) {
      const minutes = Math.floor(initialStep.target_min / 60);
      const seconds = Math.round(initialStep.target_min % 60);
      setPaceMin(String(minutes));
      setPaceSec(String(seconds).padStart(2, '0'));
    } else {
      setPaceMin('');
      setPaceSec('');
    }

    setLoadKg(formatNumericValue(initialStep?.load_kg));
    setReps(formatNumericValue(initialStep?.reps));
  }, [initialStep, stationOptions, visible]);

  const selectedStationLabel = useMemo(() => getStationLabel(stationKey), [getStationLabel, stationKey]);

  const handleSave = () => {
    const parsedDistance = parseNumber(distanceM);
    const parsedDurationMin = parseNumber(durationMin);
    const parsedLoadKg = parseNumber(loadKg);
    const parsedReps = parseNumber(reps);
    const parsedPaceMin = parseNumber(paceMin);
    const parsedPaceSec = parseNumber(paceSec);
    const targetPaceSeconds =
      parsedPaceMin !== null || parsedPaceSec !== null
        ? Math.max(1, Math.round((parsedPaceMin || 0) * 60 + (parsedPaceSec || 0)))
        : null;

    const hasTime = parsedDurationMin !== null && parsedDurationMin > 0;
    const hasDistance = parsedDistance !== null && parsedDistance > 0;
    const nextStep: BuilderStep = {
      id: initialStep?.id || Math.random().toString(),
      phase_type: stepType === 'rest' ? 'recovery' : 'interval',
      duration_type: hasDistance ? 'distance' : 'time',
      duration_s: hasTime ? Math.round(parsedDurationMin * 60) : undefined,
      distance_m: hasDistance ? Math.round(parsedDistance) : undefined,
      target_type: stepType === 'run' && targetPaceSeconds ? 'pace' : 'none',
      target_min: stepType === 'run' && targetPaceSeconds ? targetPaceSeconds : undefined,
      target_max: stepType === 'run' && targetPaceSeconds ? targetPaceSeconds : undefined,
      repetitions: 1,
      parent_step_id: initialStep?.parent_step_id || null,
      is_group: false,
      children: [],
      hyrox_step_type: stepType,
      hyrox_station_key: stepType === 'station' ? stationKey : null,
      load_kg: stepType === 'station' && parsedLoadKg !== null ? parsedLoadKg : null,
      reps: stepType === 'station' && parsedReps !== null ? Math.round(parsedReps) : null,
    };

    onSave(nextStep);
  };

  const renderTypeChip = (type: HyroxStepType, label: string) => {
    const selected = stepType === type;
    return (
      <TouchableOpacity
        key={type}
        style={[
          styles.chip,
          { backgroundColor: isDark ? themeColors.cardBackground : '#F0F0F0' },
          selected && { backgroundColor: themeColors.primary },
        ]}
        onPress={() => {
          setStepType(type);
          if (type === 'run') {
            setDistanceM(distanceM || '1000');
          }
          if (type === 'rest') {
            setDurationMin(durationMin || '2');
            setDistanceM('');
            setPaceMin('');
            setPaceSec('');
          }
          if (type === 'station') {
            setStationKey(stationKey || stationOptions[0]?.option_key || null);
            setDistanceM(distanceM === '1000' ? '' : distanceM);
          }
        }}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <Text style={[styles.chipText, { color: selected ? '#FFF' : themeColors.textSecondary }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const modalContent = (
    <SafeAreaView
      style={[styles.container, { backgroundColor: themeColors.background }, useCenteredModal && styles.containerWide]}
    >
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={onCancel} style={styles.headerAction} accessibilityRole="button">
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>
          {initialStep ? t('training.editStep') : t('training.newStep')}
        </Text>
        <TouchableOpacity onPress={handleSave} style={styles.headerAction} accessibilityRole="button">
          <Text style={styles.saveText}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: themeColors.textPrimary }]}>{t('training.hyroxStepType')}</Text>
        <View style={styles.chipRow}>
          {renderTypeChip('run', t('training.hyroxRunBlock'))}
          {renderTypeChip('station', t('training.hyroxStationBlock'))}
          {renderTypeChip('rest', t('training.hyroxRestBlock'))}
        </View>

        {stepType === 'station' && (
          <>
            <Text style={[styles.sectionLabel, { color: themeColors.textPrimary }]}>{t('training.hyroxStation')}</Text>
            <View style={styles.stationGrid}>
              {stationOptions.map(option => {
                const selected = stationKey === option.option_key;
                return (
                  <TouchableOpacity
                    key={option.option_key}
                    style={[
                      styles.stationChip,
                      {
                        borderColor: themeColors.border,
                        backgroundColor: isDark ? themeColors.cardBackground : '#F7F8FA',
                      },
                      selected && { borderColor: themeColors.primary, backgroundColor: themeColors.primary + '18' },
                    ]}
                    onPress={() => setStationKey(option.option_key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[styles.stationText, { color: selected ? themeColors.primary : themeColors.textPrimary }]}
                    >
                      {getStationLabel(option.option_key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.inputGrid}>
          {stepType !== 'rest' && (
            <View style={[styles.inputCard, { backgroundColor: isDark ? themeColors.cardBackground : '#F7F8FA' }]}>
              <Ruler size={18} color={themeColors.primary} />
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>{t('settings.distance')}</Text>
              <TextInput
                style={[styles.input, { color: themeColors.textPrimary }]}
                keyboardType="numeric"
                value={distanceM}
                onChangeText={setDistanceM}
                placeholder={stepType === 'run' ? '1000' : '0'}
                placeholderTextColor={themeColors.textSecondary}
              />
              <Text style={[styles.inputSuffix, { color: themeColors.textSecondary }]}>
                {t('training.unitMetersShort')}
              </Text>
            </View>
          )}

          <View style={[styles.inputCard, { backgroundColor: isDark ? themeColors.cardBackground : '#F7F8FA' }]}>
            <Clock size={18} color={themeColors.primary} />
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
              {stepType === 'rest' ? t('training.duration') : t('training.hyroxTargetTime')}
            </Text>
            <TextInput
              style={[styles.input, { color: themeColors.textPrimary }]}
              keyboardType="numeric"
              value={durationMin}
              onChangeText={setDurationMin}
              placeholder={stepType === 'rest' ? '2' : '0'}
              placeholderTextColor={themeColors.textSecondary}
            />
            <Text style={[styles.inputSuffix, { color: themeColors.textSecondary }]}>
              {t('training.unitMinutesShort')}
            </Text>
          </View>

          {stepType === 'run' && (
            <View style={[styles.inputCard, { backgroundColor: isDark ? themeColors.cardBackground : '#F7F8FA' }]}>
              <Zap size={18} color={themeColors.primary} />
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                {t('training.hyroxTargetPace')}
              </Text>
              <View style={styles.paceRow}>
                <TextInput
                  style={[styles.paceInput, { color: themeColors.textPrimary }]}
                  keyboardType="numeric"
                  value={paceMin}
                  onChangeText={setPaceMin}
                  placeholder="5"
                  placeholderTextColor={themeColors.textSecondary}
                />
                <Text style={[styles.paceSeparator, { color: themeColors.textSecondary }]}>:</Text>
                <TextInput
                  style={[styles.paceInput, { color: themeColors.textPrimary }]}
                  keyboardType="numeric"
                  value={paceSec}
                  onChangeText={setPaceSec}
                  placeholder="00"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
              <Text style={[styles.inputSuffix, { color: themeColors.textSecondary }]}>
                {t('training.unitMinPerKmShort')}
              </Text>
            </View>
          )}

          {stepType === 'station' && (
            <>
              <View style={[styles.inputCard, { backgroundColor: isDark ? themeColors.cardBackground : '#F7F8FA' }]}>
                <Dumbbell size={18} color={themeColors.primary} />
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                  {t('training.hyroxLoadKg')}
                </Text>
                <TextInput
                  style={[styles.input, { color: themeColors.textPrimary }]}
                  keyboardType="numeric"
                  value={loadKg}
                  onChangeText={setLoadKg}
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                />
                <Text style={[styles.inputSuffix, { color: themeColors.textSecondary }]}>
                  {t('training.unitKgShort')}
                </Text>
              </View>

              <View style={[styles.inputCard, { backgroundColor: isDark ? themeColors.cardBackground : '#F7F8FA' }]}>
                <ActivityIcon color={themeColors.primary} />
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>{t('training.hyroxReps')}</Text>
                <TextInput
                  style={[styles.input, { color: themeColors.textPrimary }]}
                  keyboardType="numeric"
                  value={reps}
                  onChangeText={setReps}
                  placeholder={stationKey === 'wall_balls' ? '100' : '0'}
                  placeholderTextColor={themeColors.textSecondary}
                />
                <Text style={[styles.inputSuffix, { color: themeColors.textSecondary }]}>
                  {t('training.unitRepsShort')}
                </Text>
              </View>
            </>
          )}
        </View>

        {stepType === 'station' && selectedStationLabel ? (
          <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>{selectedStationLabel}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );

  if (useCenteredModal) {
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
        <Pressable style={styles.overlay} onPress={onCancel}>
          <Pressable onPress={e => e.stopPropagation()}>{modalContent}</Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      {modalContent}
    </Modal>
  );
};

const ActivityIcon = ({ color }: { color: string }) => <Text style={[styles.activityIcon, { color }]}>#</Text>;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  container: {
    flex: 1,
  },
  containerWide: {
    width: 560,
    maxHeight: '84%',
    borderRadius: borderRadius.l,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerAction: {
    minWidth: 72,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  saveText: {
    color: colors.primary,
    fontWeight: '800',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  scrollContent: {
    padding: spacing.l,
    paddingBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: spacing.s,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
    marginBottom: spacing.l,
  },
  chip: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: spacing.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontWeight: '800',
  },
  stationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
    marginBottom: spacing.l,
  },
  stationChip: {
    minHeight: 44,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    justifyContent: 'center',
  },
  stationText: {
    fontWeight: '700',
  },
  inputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.m,
  },
  inputCard: {
    minWidth: 150,
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.xs,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    fontSize: 24,
    fontWeight: '900',
    paddingVertical: spacing.xs,
  },
  inputSuffix: {
    fontSize: 12,
    fontWeight: '700',
  },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paceInput: {
    fontSize: 24,
    fontWeight: '900',
    minWidth: 44,
    paddingVertical: spacing.xs,
  },
  paceSeparator: {
    fontSize: 24,
    fontWeight: '900',
    marginHorizontal: 2,
  },
  helperText: {
    marginTop: spacing.m,
    fontSize: 13,
    fontWeight: '600',
  },
  activityIcon: {
    fontSize: 18,
    fontWeight: '900',
  },
});
