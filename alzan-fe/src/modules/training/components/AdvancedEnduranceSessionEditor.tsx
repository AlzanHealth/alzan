import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { TranslationKey } from '../../../i18n/locales/en';
import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import { borderRadius, spacing, typography } from '../../../theme';
import {
  addAdvancedGroup,
  addAdvancedSection,
  collapseGroupRepetitions,
  expandGroupRepetitions,
  removeAdvancedSection,
  type AdvancedPhaseType,
  type AdvancedSectionDraft,
  type AdvancedSport,
  type AdvancedDurationType,
  calculateAdvancedTotals,
} from '../helpers/advancedEnduranceSession.helper';

type Props = {
  sport: AdvancedSport;
  sections: AdvancedSectionDraft[];
  onChange: (sections: AdvancedSectionDraft[]) => void;
  distanceUnit: string;
  toDisplayDistance: (meters: number) => number;
  toDbDistance: (distance: number) => number;
};

const PHASES: AdvancedPhaseType[] = ['warmup', 'interval', 'recovery', 'cooldown', 'relax'];
type IntensityKey = 'paceSPerKm' | 'paceSPer100m' | 'speedMPerS';
const PHASE_LABEL_KEYS: Record<AdvancedPhaseType, TranslationKey> = {
  warmup: 'training.warmup',
  interval: 'training.interval',
  recovery: 'training.recovery',
  cooldown: 'training.cooldown',
  relax: 'training.relax',
};
const DURATION_LABEL_KEYS: Record<AdvancedDurationType, TranslationKey> = {
  time: 'training.advancedDurationTime',
  distance: 'training.advancedDurationDistance',
  lap_button: 'training.advancedDurationLapButton',
};

function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

function parseDuration(value: string): number | null {
  if (!value.trim()) return null;
  if (value.includes(':')) {
    const [minutes, seconds] = value.split(':').map(Number);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return Math.max(0, minutes * 60 + seconds);
  }
  return parseNumber(value);
}

function SectionEditor({
  section,
  sport,
  distanceUnit,
  toDisplayDistance,
  toDbDistance,
  onChange,
  onDelete,
  compact = false,
}: {
  section: AdvancedSectionDraft;
  sport: AdvancedSport;
  distanceUnit: string;
  toDisplayDistance: (meters: number) => number;
  toDbDistance: (distance: number) => number;
  onChange: (section: AdvancedSectionDraft) => void;
  onDelete?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { colors: themeColors, styles: dynamicStyles } = useTrainingStyles();
  const updateNumber = (key: keyof AdvancedSectionDraft, value: string) => {
    onChange({ ...section, [key]: parseNumber(value) });
  };

  const inputStyle = [
    styles.input,
    dynamicStyles.input,
    { color: themeColors.textPrimary },
    compact && styles.compactInput,
  ];
  const showHeartRate = sport !== 'swimming';
  const showPower = sport === 'cycling';
  const distanceValue = section.distanceM == null ? '' : String(toDisplayDistance(section.distanceM));
  const intensityLabel =
    sport === 'running' ? t('training.pace') : sport === 'swimming' ? t('training.pacePer100m') : t('training.speed');
  const intensityKey: IntensityKey =
    sport === 'running' ? 'paceSPerKm' : sport === 'swimming' ? 'paceSPer100m' : 'speedMPerS';

  return (
    <View style={[styles.sectionEditor, dynamicStyles.glassCard, compact && styles.compactEditor]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
            {t(PHASE_LABEL_KEYS[section.phaseType])}
          </Text>
          {section.repetitionIndex != null && (
            <Text style={[styles.repetitionLabel, { color: themeColors.textSecondary }]}>
              {t('training.repetitionNumber', { number: section.repetitionIndex })}
            </Text>
          )}
        </View>
        {onDelete && (
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={t('training.removeStep')}
            hitSlop={8}
          >
            <Trash2 size={18} color={themeColors.danger} />
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {PHASES.map(phase => (
          <Pressable
            key={phase}
            onPress={() => onChange({ ...section, phaseType: phase })}
            style={[
              styles.chip,
              { backgroundColor: section.phaseType === phase ? themeColors.primary : themeColors.background },
            ]}
          >
            <Text
              style={[styles.chipText, { color: section.phaseType === phase ? '#FFFFFF' : themeColors.textSecondary }]}
            >
              {t(PHASE_LABEL_KEYS[phase])}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {(Object.keys(DURATION_LABEL_KEYS) as AdvancedDurationType[]).map(durationType => (
          <Pressable
            key={durationType}
            onPress={() => onChange({ ...section, durationType })}
            style={[
              styles.chip,
              { backgroundColor: section.durationType === durationType ? themeColors.primary : themeColors.background },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: section.durationType === durationType ? '#FFFFFF' : themeColors.textSecondary },
              ]}
            >
              {t(DURATION_LABEL_KEYS[durationType])}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.fieldRow}>
        <View style={styles.fieldHalf}>
          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{t('training.distance')}</Text>
          <TextInput
            style={inputStyle}
            keyboardType="decimal-pad"
            value={distanceValue}
            placeholder="0"
            placeholderTextColor={themeColors.textSecondary}
            onChangeText={value =>
              onChange({ ...section, distanceM: value ? toDbDistance(parseNumber(value) ?? 0) : null })
            }
          />
          <Text style={[styles.unitLabel, { color: themeColors.textSecondary }]}>{distanceUnit}</Text>
        </View>
        <View style={styles.fieldHalf}>
          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{t('training.duration')}</Text>
          <TextInput
            style={inputStyle}
            keyboardType="decimal-pad"
            value={formatDuration(section.durationS)}
            placeholder="0:00"
            placeholderTextColor={themeColors.textSecondary}
            onChangeText={value => onChange({ ...section, durationS: parseDuration(value) })}
          />
        </View>
      </View>

      <View style={styles.fieldRow}>
        <View style={styles.fieldHalf}>
          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{intensityLabel}</Text>
          <TextInput
            style={inputStyle}
            keyboardType="decimal-pad"
            value={section[intensityKey] == null ? '' : String(section[intensityKey])}
            placeholder={sport === 'cycling' ? '0' : '0:00'}
            placeholderTextColor={themeColors.textSecondary}
            onChangeText={value => updateNumber(intensityKey, value)}
          />
        </View>
        <View style={styles.fieldHalf}>
          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{t('training.effortRpe')}</Text>
          <TextInput
            style={inputStyle}
            keyboardType="decimal-pad"
            value={section.rpe == null ? '' : String(section.rpe)}
            placeholder="0–10"
            placeholderTextColor={themeColors.textSecondary}
            onChangeText={value => updateNumber('rpe', value)}
          />
        </View>
      </View>

      {(showHeartRate || showPower) && (
        <View style={styles.fieldRow}>
          {showHeartRate && (
            <View style={styles.fieldHalf}>
              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>
                {t('training.avgHeartRate')}
              </Text>
              <TextInput
                style={inputStyle}
                keyboardType="number-pad"
                value={section.heartRateAvg == null ? '' : String(section.heartRateAvg)}
                placeholder="0"
                placeholderTextColor={themeColors.textSecondary}
                onChangeText={value => updateNumber('heartRateAvg', value)}
              />
            </View>
          )}
          {showPower && (
            <View style={styles.fieldHalf}>
              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{t('training.avgPower')}</Text>
              <TextInput
                style={inputStyle}
                keyboardType="number-pad"
                value={section.powerAvgW == null ? '' : String(section.powerAvgW)}
                placeholder="0"
                placeholderTextColor={themeColors.textSecondary}
                onChangeText={value => updateNumber('powerAvgW', value)}
              />
            </View>
          )}
        </View>
      )}

      {(showHeartRate || showPower || sport !== 'swimming') && (
        <View style={styles.fieldRow}>
          {showHeartRate && (
            <View style={styles.fieldHalf}>
              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>
                {t('training.maxHeartRate')}
              </Text>
              <TextInput
                style={inputStyle}
                keyboardType="number-pad"
                value={section.heartRateMax == null ? '' : String(section.heartRateMax)}
                placeholder="0"
                placeholderTextColor={themeColors.textSecondary}
                onChangeText={value => updateNumber('heartRateMax', value)}
              />
            </View>
          )}
          {showPower && (
            <View style={styles.fieldHalf}>
              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{t('training.maxPowerW')}</Text>
              <TextInput
                style={inputStyle}
                keyboardType="number-pad"
                value={section.powerMaxW == null ? '' : String(section.powerMaxW)}
                placeholder="0"
                placeholderTextColor={themeColors.textSecondary}
                onChangeText={value => updateNumber('powerMaxW', value)}
              />
            </View>
          )}
        </View>
      )}

      {(sport === 'cycling' || sport === 'running') && (
        <View style={styles.fieldRow}>
          {sport === 'cycling' && (
            <View style={styles.fieldHalf}>
              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{t('training.cadenceRpm')}</Text>
              <TextInput
                style={inputStyle}
                keyboardType="number-pad"
                value={section.cadenceAvg == null ? '' : String(section.cadenceAvg)}
                placeholder="0"
                placeholderTextColor={themeColors.textSecondary}
                onChangeText={value => updateNumber('cadenceAvg', value)}
              />
            </View>
          )}
          <View style={styles.fieldHalf}>
            <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{t('training.elevationM')}</Text>
            <TextInput
              style={inputStyle}
              keyboardType="decimal-pad"
              value={section.elevationGainM == null ? '' : String(section.elevationGainM)}
              placeholder="0"
              placeholderTextColor={themeColors.textSecondary}
              onChangeText={value => updateNumber('elevationGainM', value)}
            />
          </View>
        </View>
      )}

      <View style={styles.fieldRow}>
        <View style={styles.fieldHalf}>
          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{t('training.caloriesKcal')}</Text>
          <TextInput
            style={inputStyle}
            keyboardType="decimal-pad"
            value={section.caloriesKcal == null ? '' : String(section.caloriesKcal)}
            placeholder="0"
            placeholderTextColor={themeColors.textSecondary}
            onChangeText={value => updateNumber('caloriesKcal', value)}
          />
        </View>
        <View style={styles.fieldHalf}>
          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{t('training.note')}</Text>
          <TextInput
            style={inputStyle}
            value={section.notes ?? ''}
            placeholder={t('training.note')}
            placeholderTextColor={themeColors.textSecondary}
            onChangeText={value => onChange({ ...section, notes: value || null })}
          />
        </View>
      </View>
    </View>
  );
}

export const AdvancedEnduranceSessionEditor = ({
  sport,
  sections,
  onChange,
  distanceUnit,
  toDisplayDistance,
  toDbDistance,
}: Props) => {
  const { t } = useTranslation();
  const { colors: themeColors, styles: dynamicStyles } = useTrainingStyles();
  const [customGroups, setCustomGroups] = useState<Set<string>>(new Set());

  const topLevelSections = useMemo(() => sections.filter(section => section.parentClientId == null), [sections]);
  const updateSection = (next: AdvancedSectionDraft) =>
    onChange(sections.map(section => (section.clientId === next.clientId ? next : section)));
  const deleteSection = (clientId: string) => onChange(removeAdvancedSection(sections, clientId));

  const toggleGroup = (groupId: string, custom: boolean) => {
    setCustomGroups(previous => {
      const next = new Set(previous);
      if (custom) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
    onChange(custom ? expandGroupRepetitions(sections, groupId) : collapseGroupRepetitions(sections, groupId));
  };

  const addStep = (parentClientId: string | null = null) => {
    const clientId = `step-${Date.now()}-${sections.length}`;
    if (parentClientId) {
      const group = sections.find(section => section.clientId === parentClientId);
      if (group && customGroups.has(parentClientId)) {
        const child = addAdvancedSection(sections, clientId, parentClientId).at(-1);
        if (child) {
          const expanded = Array.from({ length: group.repetitions }, (_, index) => ({
            ...child,
            clientId: `${clientId}-rep-${index + 1}`,
            repetitionIndex: index + 1,
          }));
          onChange([...sections, ...expanded]);
          return;
        }
      }
    }
    onChange(addAdvancedSection(sections, clientId, parentClientId));
  };

  const addGroup = () => {
    onChange(
      addAdvancedGroup(
        sections,
        `group-${Date.now()}-${sections.length}`,
        `step-${Date.now()}-${sections.length}-child`,
      ),
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.modeIntro, dynamicStyles.glassCard]}>
        <View style={styles.modeIntroCopy}>
          <Text style={[styles.modeTitle, { color: themeColors.textPrimary }]}>
            {t('training.advancedRegistration')}
          </Text>
          <Text style={[styles.modeSubtitle, { color: themeColors.textSecondary }]}>
            {t('training.advancedRegistrationHint')}
          </Text>
        </View>
        <Text style={[styles.sportBadge, { backgroundColor: themeColors.primary + '20', color: themeColors.primary }]}>
          {t(`constants.${sport === 'cycling' ? 'cycling' : sport}`)}
        </Text>
      </View>

      {topLevelSections.map(section => {
        if (!section.isGroup) {
          return (
            <SectionEditor
              key={section.clientId}
              section={section}
              sport={sport}
              distanceUnit={distanceUnit}
              toDisplayDistance={toDisplayDistance}
              toDbDistance={toDbDistance}
              onChange={updateSection}
              onDelete={sections.length > 1 ? () => deleteSection(section.clientId) : undefined}
            />
          );
        }

        const commonChildren = sections.filter(
          child => child.parentClientId === section.clientId && child.repetitionIndex == null,
        );
        const repeatedChildren = sections.filter(
          child => child.parentClientId === section.clientId && child.repetitionIndex != null,
        );
        const isCustom = customGroups.has(section.clientId);
        const repetitionIndexes = Array.from(
          new Set(
            repeatedChildren.map(child => child.repetitionIndex).filter((value): value is number => value != null),
          ),
        ).sort((a, b) => a - b);

        return (
          <View key={section.clientId} style={[styles.groupCard, dynamicStyles.glassCard]}>
            <View style={styles.groupHeader}>
              <View>
                <Text style={[styles.groupTitle, { color: themeColors.textPrimary }]}>
                  {t('training.repeatedBlock')}
                </Text>
                <Text style={[styles.groupSubtitle, { color: themeColors.textSecondary }]}>
                  {section.repetitions}× {t('training.repetitions').toLowerCase()}
                </Text>
              </View>
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: themeColors.textSecondary }]}>
                  {t('training.sameValueForAll')}
                </Text>
                <Switch
                  value={!isCustom}
                  onValueChange={value => toggleGroup(section.clientId, !value)}
                  trackColor={{ false: themeColors.textSecondary, true: themeColors.primary + '60' }}
                  thumbColor={!isCustom ? themeColors.primary : themeColors.background}
                  accessibilityLabel={t('training.sameValueForAll')}
                />
              </View>
            </View>

            {!isCustom &&
              commonChildren.map(child => (
                <SectionEditor
                  key={child.clientId}
                  section={child}
                  sport={sport}
                  distanceUnit={distanceUnit}
                  toDisplayDistance={toDisplayDistance}
                  toDbDistance={toDbDistance}
                  onChange={updateSection}
                  onDelete={() => deleteSection(child.clientId)}
                  compact
                />
              ))}

            {isCustom &&
              repetitionIndexes.map(index => (
                <View key={`${section.clientId}-rep-${index}`} style={styles.repetitionCard}>
                  <Text style={[styles.repetitionTitle, { color: themeColors.primary }]}>
                    {t('training.repetitionNumber', { number: index })}
                  </Text>
                  {repeatedChildren
                    .filter(child => child.repetitionIndex === index)
                    .map(child => (
                      <SectionEditor
                        key={child.clientId}
                        section={child}
                        sport={sport}
                        distanceUnit={distanceUnit}
                        toDisplayDistance={toDisplayDistance}
                        toDbDistance={toDbDistance}
                        onChange={updateSection}
                        onDelete={() => deleteSection(child.clientId)}
                        compact
                      />
                    ))}
                </View>
              ))}

            <View style={styles.groupActions}>
              <Pressable style={styles.secondaryAction} onPress={() => addStep(section.clientId)}>
                <Plus size={16} color={themeColors.primary} />
                <Text style={[styles.actionText, { color: themeColors.primary }]}>{t('training.addStep')}</Text>
              </Pressable>
              <Pressable style={styles.secondaryAction} onPress={() => deleteSection(section.clientId)}>
                <Trash2 size={16} color={themeColors.danger} />
                <Text style={[styles.actionText, { color: themeColors.danger }]}>{t('training.removeStep')}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {(() => {
        const totals = calculateAdvancedTotals(sections);
        return (
          <View style={[styles.totalsCard, dynamicStyles.glassCard]}>
            <Text style={[styles.totalsTitle, { color: themeColors.textPrimary }]}>{t('training.totalTab')}</Text>
            <View style={styles.totalsRow}>
              <Text style={[styles.totalsValue, { color: themeColors.textPrimary }]}>
                ⏱ {formatDuration(totals.durationS) || '—'}
              </Text>
              <Text style={[styles.totalsValue, { color: themeColors.textPrimary }]}>
                ↔ {totals.distanceM == null ? '—' : `${toDisplayDistance(totals.distanceM)} ${distanceUnit}`}
              </Text>
            </View>
          </View>
        );
      })()}

      <View style={styles.bottomActions}>
        <Pressable style={[styles.addButton, { backgroundColor: themeColors.primary }]} onPress={() => addStep()}>
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.addButtonText}>{t('training.addStep')}</Text>
        </Pressable>
        <Pressable style={[styles.addButton, { backgroundColor: themeColors.primary + '18' }]} onPress={addGroup}>
          <Plus size={18} color={themeColors.primary} />
          <Text style={[styles.addButtonText, { color: themeColors.primary }]}>{t('training.addRepeatedBlock')}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.m },
  modeIntro: {
    borderRadius: borderRadius.l,
    padding: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modeIntroCopy: { flex: 1, paddingRight: spacing.s },
  modeTitle: { ...typography.h3 },
  modeSubtitle: { ...typography.caption, marginTop: spacing.xs },
  sportBadge: {
    ...typography.caption,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
  sectionEditor: { borderRadius: borderRadius.l, padding: spacing.m },
  compactEditor: { marginTop: spacing.s, padding: spacing.s },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeaderCopy: { flex: 1 },
  sectionTitle: { ...typography.h4 },
  repetitionLabel: { ...typography.caption, marginTop: 2 },
  chipRow: { gap: spacing.xs, paddingVertical: spacing.s },
  chip: { borderRadius: borderRadius.full, paddingHorizontal: spacing.s, paddingVertical: spacing.xs },
  chipText: { ...typography.caption },
  fieldRow: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.s },
  fieldHalf: { flex: 1, position: 'relative' },
  fieldLabel: { ...typography.caption, marginBottom: spacing.xs },
  input: {
    minHeight: 44,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    fontSize: 16,
  },
  compactInput: { minHeight: 40, fontSize: 14 },
  unitLabel: { position: 'absolute', right: spacing.s, bottom: 13, fontSize: 12 },
  groupCard: { borderRadius: borderRadius.l, padding: spacing.m },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupTitle: { ...typography.h4 },
  groupSubtitle: { ...typography.caption, marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '52%' },
  switchLabel: { ...typography.caption, textAlign: 'right' },
  repetitionCard: {
    marginTop: spacing.s,
    borderRadius: borderRadius.m,
    padding: spacing.s,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  repetitionTitle: { ...typography.body, fontWeight: '700', marginBottom: spacing.xs },
  groupActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.s },
  secondaryAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  actionText: { ...typography.caption, fontWeight: '700' },
  bottomActions: { gap: spacing.s },
  addButton: {
    minHeight: 48,
    borderRadius: borderRadius.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addButtonText: { ...typography.body, color: '#FFFFFF', fontWeight: '700' },
  totalsCard: { borderRadius: borderRadius.l, padding: spacing.m, gap: spacing.s },
  totalsTitle: { ...typography.h4 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.s },
  totalsValue: { ...typography.body, fontWeight: '700' },
});
