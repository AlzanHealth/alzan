import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import { borderRadius, spacing, typography } from '../../../theme';
import { DECIMAL_INPUT_PROPS } from '../../../utils/numericInput';
import { formatDurationTime } from '../../../utils/unitConversionUtils';
import { parseDurationInput } from '../helpers/durationInput.helper';
import {
  deriveKilometerSectionMetrics,
  type AdvancedSport,
  type KilometerSectionDraft,
} from '../helpers/advancedEnduranceSession.helper';

type Props = {
  sport: AdvancedSport;
  distanceInput: string;
  sections: KilometerSectionDraft[];
  onDistanceInputChange: (value: string) => void;
  onDistanceCommit: () => void;
  onChange: (sections: KilometerSectionDraft[]) => void;
};

type BufferedDurationInputProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  formattedValue: string;
  onCommit: (value: string) => void;
  onDraftChange?: (value: string) => void;
};

function BufferedDurationInput({
  formattedValue,
  onCommit,
  onDraftChange,
  onBlur,
  onFocus,
  ...props
}: BufferedDurationInputProps) {
  const [draft, setDraft] = React.useState(formattedValue);
  const [isFocused, setIsFocused] = React.useState(false);

  React.useEffect(() => {
    if (!isFocused) setDraft(formattedValue);
  }, [formattedValue, isFocused]);

  return (
    <TextInput
      {...props}
      value={draft}
      onChangeText={value => {
        setDraft(value);
        onDraftChange?.(value);
      }}
      onFocus={event => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onBlur={event => {
        setIsFocused(false);
        onCommit(draft);
        onBlur?.(event);
      }}
    />
  );
}

export const KilometerEnduranceSessionEditor = ({
  sport,
  distanceInput,
  sections,
  onDistanceInputChange,
  onDistanceCommit,
  onChange,
}: Props) => {
  const { t } = useTranslation();
  const { colors: themeColors, styles: dynamicStyles } = useTrainingStyles();

  const updateDuration = useCallback(
    (clientId: string, value: string) => {
      const durationS = value.trim() ? parseDurationInput(value) : null;
      if (value.trim() && durationS == null) return;
      onChange(
        sections.map(section =>
          section.clientId === clientId ? deriveKilometerSectionMetrics({ ...section, durationS }, sport) : section,
        ),
      );
    },
    [onChange, sections, sport],
  );

  const renderSection = useCallback(
    ({ item }: { item: KilometerSectionDraft }) => {
      const intensity =
        sport === 'running' ? item.paceSPerKm : sport === 'swimming' ? item.paceSPer100m : item.speedMPerS;
      const intensityLabel =
        sport === 'running'
          ? t('training.pace')
          : sport === 'swimming'
            ? t('training.pacePer100m')
            : t('training.speed');
      const intensityValue =
        intensity == null
          ? '—'
          : sport === 'cycling'
            ? `${(intensity * 3.6).toFixed(1)} km/h`
            : `${formatDurationTime(intensity)}/${sport === 'swimming' ? '100 m' : 'km'}`;

      return (
        <View style={[styles.sectionCard, dynamicStyles.glassCard]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>
              {t('training.kilometerInterval', { number: item.kilometerIndex })}
            </Text>
            <Text style={[styles.distance, { color: themeColors.textSecondary }]}>
              {((item.distanceM ?? 0) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })}{' '}
              {t('settings.unitKm')}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricField}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>{t('training.duration')}</Text>
              <BufferedDurationInput
                style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                formattedValue={item.durationS == null ? '' : formatDurationTime(item.durationS)}
                placeholder="0:00"
                placeholderTextColor={themeColors.textSecondary}
                onDraftChange={value => updateDuration(item.clientId, value)}
                onCommit={value => updateDuration(item.clientId, value)}
              />
            </View>
            <View style={styles.metricField}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>{intensityLabel}</Text>
              <Text style={[styles.metricValue, { color: themeColors.textPrimary }]}>{intensityValue}</Text>
            </View>
          </View>
        </View>
      );
    },
    [dynamicStyles, sport, t, themeColors, updateDuration],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.distanceCard, dynamicStyles.glassCard]}>
        <Text style={[styles.label, { color: themeColors.textSecondary }]}>{t('training.totalDistanceKm')}</Text>
        <View style={styles.distanceInputRow}>
          <TextInput
            {...DECIMAL_INPUT_PROPS}
            style={[styles.distanceInput, dynamicStyles.input, { color: themeColors.textPrimary }]}
            value={distanceInput}
            onChangeText={onDistanceInputChange}
            onBlur={onDistanceCommit}
            placeholder="0"
            placeholderTextColor={themeColors.textSecondary}
          />
          <Text style={[styles.unit, { color: themeColors.textSecondary }]}>{t('settings.unitKm')}</Text>
        </View>
        <Text style={[styles.hint, { color: themeColors.textSecondary }]}>{t('training.kilometerIntervalsHint')}</Text>
      </View>
      <FlatList
        data={sections}
        keyExtractor={item => item.clientId}
        renderItem={renderSection}
        scrollEnabled={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.m },
  distanceCard: { borderRadius: borderRadius.l, padding: spacing.l },
  distanceInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  distanceInput: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.m,
    fontSize: 18,
  },
  unit: { ...typography.body, minWidth: 26 },
  hint: { ...typography.caption, marginTop: spacing.s, lineHeight: 18 },
  list: { gap: spacing.m },
  sectionCard: { borderRadius: borderRadius.l, padding: spacing.l },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.s },
  sectionTitle: { ...typography.h4, fontWeight: '800' },
  distance: { ...typography.caption },
  metricRow: { flexDirection: 'row', gap: spacing.m, marginTop: spacing.m },
  metricField: { flex: 1 },
  label: { ...typography.caption, marginBottom: spacing.s },
  input: { minHeight: 50, borderWidth: 1, borderRadius: borderRadius.m, paddingHorizontal: spacing.m, fontSize: 17 },
  metricValue: { minHeight: 50, paddingVertical: spacing.m, fontSize: 16, fontWeight: '700' },
});
