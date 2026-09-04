import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { TranslationKey } from '../../../i18n/locales/en';
import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import { borderRadius, spacing, typography } from '../../../theme';
import {
  DECIMAL_INPUT_PROPS,
  INTEGER_INPUT_PROPS,
  TIME_INPUT_PROPS,
  parseLocalizedDecimal,
} from '../../../utils/numericInput';
import {
  addAdvancedGroup,
  calculateAdvancedTotals,
  collapseGroupRepetitions,
  createEmptyAdvancedSection,
  deriveAdvancedSectionMetrics,
  expandGroupRepetitions,
  insertAdvancedSectionsAfterSubtree,
  removeAdvancedSection,
  type AdvancedDurationType,
  type AdvancedMetricField,
  type AdvancedPhaseType,
  type AdvancedSectionDraft,
  type AdvancedSport,
} from '../helpers/advancedEnduranceSession.helper';
import { parsePaceInput } from '../helpers/paceInput.helper';
import type { EnduranceMetricPriority } from '../helpers/enduranceMetricPriority.helper';

type Props = {
  sport: AdvancedSport;
  sections: AdvancedSectionDraft[];
  onChange: (sections: AdvancedSectionDraft[]) => void;
  distanceUnit: string;
  toDisplayDistance: (meters: number) => number;
  toDbDistance: (distance: number) => number;
  metricPriority: EnduranceMetricPriority;
};

type AddMode = { kind: 'step' | 'group'; parentClientId: string | null } | null;
type VisibleDurationType = 'time' | 'distance';

const PHASES: AdvancedPhaseType[] = ['warmup', 'interval', 'recovery', 'cooldown', 'relax'];
const PHASE_LABEL_KEYS: Record<AdvancedPhaseType, TranslationKey> = {
  warmup: 'training.warmup',
  interval: 'training.interval',
  recovery: 'training.recovery',
  cooldown: 'training.cooldown',
  relax: 'training.relax',
};
const DURATION_TYPES: VisibleDurationType[] = ['time', 'distance'];
const DURATION_LABEL_KEYS: Record<VisibleDurationType, TranslationKey> = {
  time: 'training.advancedDurationTime',
  distance: 'training.advancedDurationDistance',
};
const DURATION_HINT_KEYS: Record<VisibleDurationType, TranslationKey> = {
  time: 'training.advancedDurationTimeHint',
  distance: 'training.advancedDurationDistanceHint',
};

type BufferedMetricInputProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  formattedValue: string;
  onCommit: (value: string) => void;
};

function BufferedMetricInput({ formattedValue, onCommit, onBlur, onFocus, ...props }: BufferedMetricInputProps) {
  const [draft, setDraft] = useState(formattedValue);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) setDraft(formattedValue);
  }, [formattedValue, isFocused]);

  return (
    <TextInput
      {...props}
      value={draft}
      onChangeText={setDraft}
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

function parseNumber(value: string): number | null {
  const parsed = parseLocalizedDecimal(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
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

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

function formatDistance(
  section: AdvancedSectionDraft,
  sport: AdvancedSport,
  distanceUnit: string,
  toDisplayDistance: (meters: number) => number,
): string {
  if (section.distanceM == null || section.distanceM <= 0) return '';
  if (sport === 'swimming') return `${Math.round(section.distanceM)} m`;
  return `${toDisplayDistance(section.distanceM)} ${distanceUnit}`;
}

function phaseColor(phase: AdvancedPhaseType, colors: ReturnType<typeof useTrainingStyles>['colors']): string {
  switch (phase) {
    case 'warmup':
      return colors.success;
    case 'recovery':
      return colors.textSecondary;
    case 'cooldown':
      return colors.accent;
    case 'interval':
      return colors.danger;
    default:
      return colors.primary;
  }
}

function SectionEditor({
  section,
  sport,
  distanceUnit,
  toDisplayDistance,
  toDbDistance,
  metricPriority,
  onChange,
  onDelete,
  expanded,
  onToggle,
  compact = false,
}: {
  section: AdvancedSectionDraft;
  sport: AdvancedSport;
  distanceUnit: string;
  toDisplayDistance: (meters: number) => number;
  toDbDistance: (distance: number) => number;
  metricPriority: EnduranceMetricPriority;
  onChange: (section: AdvancedSectionDraft) => void;
  onDelete?: () => void;
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { colors: themeColors, styles: dynamicStyles } = useTrainingStyles();
  const [intensityError, setIntensityError] = useState(false);
  const accent = phaseColor(section.phaseType, themeColors);
  const distanceLabel = sport === 'swimming' ? 'm' : distanceUnit;
  const intensityKey = sport === 'running' ? 'paceSPerKm' : sport === 'swimming' ? 'paceSPer100m' : 'speedMPerS';
  const intensityLabel =
    sport === 'running' ? t('training.pace') : sport === 'swimming' ? t('training.pacePer100m') : t('training.speed');
  const intensityValue = section[intensityKey];
  const selectedDurationType = section.durationType === 'distance' ? 'distance' : 'time';
  const summary = [
    formatDistance(section, sport, distanceUnit, toDisplayDistance),
    section.durationS ? formatDuration(section.durationS) : '',
    intensityValue != null
      ? sport === 'cycling'
        ? `${intensityValue}`
        : `${formatDuration(intensityValue)}/${sport === 'swimming' ? '100 m' : 'km'}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const inputStyle = [
    styles.input,
    dynamicStyles.input,
    { color: themeColors.textPrimary },
    compact && styles.compactInput,
  ];
  const updateMetric = (field: AdvancedMetricField, value: number | null) => {
    const fieldValues =
      field === 'duration'
        ? { durationS: value }
        : field === 'distance'
          ? { distanceM: value }
          : { [intensityKey]: value };
    onChange(deriveAdvancedSectionMetrics({ ...section, ...fieldValues }, sport, field, metricPriority));
  };
  return (
    <View
      style={[styles.sectionCard, dynamicStyles.glassCard, compact && styles.compactCard, { borderLeftColor: accent }]}
    >
      <View style={styles.cardHeader}>
        <Pressable style={styles.cardHeaderCopy} onPress={onToggle} accessibilityRole="button">
          <Text style={[styles.phaseLabel, { color: accent }]}>{t(PHASE_LABEL_KEYS[section.phaseType])}</Text>
          <Text style={[styles.cardSummary, { color: themeColors.textPrimary }]} numberOfLines={1}>
            {summary || t('training.toComplete')}
          </Text>
        </Pressable>
        <View style={styles.headerActions}>
          {onDelete && (
            <Pressable
              onPress={onDelete}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('training.removeStep')}
            >
              <Trash2 size={18} color={themeColors.danger} />
            </Pressable>
          )}
          <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={t('training.toggleDetails')}>
            {expanded ? (
              <ChevronUp size={21} color={themeColors.primary} />
            ) : (
              <ChevronDown size={21} color={themeColors.primary} />
            )}
          </Pressable>
        </View>
      </View>

      {expanded && (
        <View style={styles.cardBody}>
          <Text style={[styles.choiceSectionLabel, { color: themeColors.textSecondary }]}>{t('training.phases')}</Text>
          <View style={styles.choiceWrap}>
            {PHASES.map(phase => (
              <Pressable
                key={phase}
                onPress={() => onChange({ ...section, phaseType: phase })}
                style={[
                  styles.choice,
                  { backgroundColor: section.phaseType === phase ? themeColors.primary : themeColors.background },
                ]}
              >
                <Text
                  style={[
                    styles.choiceText,
                    { color: section.phaseType === phase ? '#FFFFFF' : themeColors.textSecondary },
                  ]}
                >
                  {t(PHASE_LABEL_KEYS[phase])}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.choiceSectionLabel, { color: themeColors.textSecondary }]}>
            {t('training.chooseDurationType')}
          </Text>
          <View style={styles.choiceWrap}>
            {DURATION_TYPES.map(durationType => (
              <Pressable
                key={durationType}
                onPress={() => onChange({ ...section, durationType })}
                style={[
                  styles.choice,
                  {
                    backgroundColor:
                      section.durationType === durationType ? themeColors.primary : themeColors.background,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.choiceText,
                    { color: section.durationType === durationType ? '#FFFFFF' : themeColors.textSecondary },
                  ]}
                >
                  {t(DURATION_LABEL_KEYS[durationType])}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.choiceHint, { color: themeColors.textSecondary }]}>
            {t(DURATION_HINT_KEYS[selectedDurationType])}
          </Text>

          {selectedDurationType === 'time' ? (
            <View style={styles.primaryField}>
              <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>{t('training.duration')}</Text>
              <BufferedMetricInput
                style={inputStyle}
                {...TIME_INPUT_PROPS}
                formattedValue={formatDuration(section.durationS)}
                placeholder="0:00"
                placeholderTextColor={themeColors.textSecondary}
                onCommit={value => updateMetric('duration', parseDuration(value))}
              />
            </View>
          ) : (
            <View style={styles.primaryField}>
              <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>{t('training.distance')}</Text>
              <View>
                <BufferedMetricInput
                  style={inputStyle}
                  {...DECIMAL_INPUT_PROPS}
                  formattedValue={
                    section.distanceM == null
                      ? ''
                      : sport === 'swimming'
                        ? String(section.distanceM)
                        : String(toDisplayDistance(section.distanceM))
                  }
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  onCommit={value =>
                    updateMetric(
                      'distance',
                      value
                        ? sport === 'swimming'
                          ? parseNumber(value)
                          : toDbDistance(parseNumber(value) ?? 0)
                        : null,
                    )
                  }
                />
                <Text style={[styles.unitLabel, { color: themeColors.textSecondary }]}>{distanceLabel}</Text>
              </View>
            </View>
          )}

          <View style={styles.secondaryField}>
            <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>
              {selectedDurationType === 'time'
                ? `${t('training.distance')} · ${t('training.optional')}`
                : `${t('training.duration')} · ${t('training.optional')}`}
            </Text>
            {selectedDurationType === 'time' ? (
              <View>
                <BufferedMetricInput
                  style={inputStyle}
                  {...DECIMAL_INPUT_PROPS}
                  formattedValue={
                    section.distanceM == null
                      ? ''
                      : sport === 'swimming'
                        ? String(section.distanceM)
                        : String(toDisplayDistance(section.distanceM))
                  }
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  onCommit={value =>
                    updateMetric(
                      'distance',
                      value
                        ? sport === 'swimming'
                          ? parseNumber(value)
                          : toDbDistance(parseNumber(value) ?? 0)
                        : null,
                    )
                  }
                />
                <Text style={[styles.unitLabel, { color: themeColors.textSecondary }]}>{distanceLabel}</Text>
              </View>
            ) : (
              <BufferedMetricInput
                style={inputStyle}
                {...TIME_INPUT_PROPS}
                formattedValue={formatDuration(section.durationS)}
                placeholder="0:00"
                placeholderTextColor={themeColors.textSecondary}
                onCommit={value => updateMetric('duration', parseDuration(value))}
              />
            )}
          </View>

          <View style={styles.intensityField}>
            <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{intensityLabel}</Text>
            <BufferedMetricInput
              style={inputStyle}
              {...(sport === 'cycling' ? DECIMAL_INPUT_PROPS : TIME_INPUT_PROPS)}
              formattedValue={
                intensityValue == null
                  ? ''
                  : sport === 'cycling'
                    ? String(intensityValue)
                    : formatDuration(intensityValue)
              }
              placeholder={sport === 'cycling' ? '0' : '0:00'}
              placeholderTextColor={themeColors.textSecondary}
              onFocus={() => setIntensityError(false)}
              onCommit={value => {
                if (sport === 'cycling') {
                  setIntensityError(false);
                  updateMetric('intensity', parseNumber(value));
                  return;
                }

                if (!value.trim()) {
                  setIntensityError(false);
                  updateMetric('intensity', null);
                  return;
                }

                const parsedPace = parsePaceInput(value);
                if (!parsedPace.ok) {
                  setIntensityError(true);
                  return;
                }

                setIntensityError(false);
                updateMetric('intensity', parsedPace.totalSeconds);
              }}
            />
            {sport !== 'cycling' && !intensityError && (
              <Text style={[styles.choiceHint, { color: themeColors.textSecondary }]}>
                {t('training.paceDecimalHint')}
              </Text>
            )}
            {intensityError && (
              <Text style={[styles.choiceHint, { color: themeColors.danger }]}>{t('training.invalidPaceFormat')}</Text>
            )}
          </View>
        </View>
      )}
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
  metricPriority,
}: Props) => {
  const { t } = useTranslation();
  const { colors: themeColors, styles: dynamicStyles } = useTrainingStyles();
  const [customGroups, setCustomGroups] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [newPhase, setNewPhase] = useState<AdvancedPhaseType>('interval');
  const [newDurationType, setNewDurationType] = useState<VisibleDurationType>('time');
  const [newRepetitions, setNewRepetitions] = useState('4');

  const renderedSections = useMemo(
    () => sections.map(section => deriveAdvancedSectionMetrics(section, sport, undefined, metricPriority)),
    [metricPriority, sections, sport],
  );
  const topLevelSections = useMemo(
    () => renderedSections.filter(section => section.parentClientId == null),
    [renderedSections],
  );
  const updateSection = (next: AdvancedSectionDraft) =>
    onChange(sections.map(section => (section.clientId === next.clientId ? next : section)));
  const deleteSection = (clientId: string) => onChange(removeAdvancedSection(sections, clientId));
  const toggleCollapsed = (clientId: string) =>
    setCollapsedSections(previous => {
      const next = new Set(previous);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  const openAddModal = (kind: 'step' | 'group', parentClientId: string | null = null) => {
    setNewPhase('interval');
    setNewDurationType('time');
    setNewRepetitions('4');
    setAddMode({ kind, parentClientId });
  };
  const closeAddModal = () => setAddMode(null);
  const createId = (prefix: string) => `${prefix}-${Date.now()}-${sections.length}`;

  const addConfiguredStep = () => {
    if (!addMode) return;
    if (addMode.kind === 'group') {
      const groupId = createId('group');
      const childId = createId('step');
      const recoveryId = createId('recovery');
      const repetitions = Math.max(1, Number.parseInt(newRepetitions, 10) || 1);
      const added = addAdvancedGroup(sections, groupId, childId).map(section =>
        section.clientId === groupId
          ? { ...section, phaseType: newPhase, durationType: 'lap_button' as AdvancedDurationType, repetitions }
          : { ...section, phaseType: newPhase, durationType: newDurationType },
      );
      added.push({
        ...createEmptyAdvancedSection(recoveryId, groupId),
        phaseType: 'recovery',
        durationType: 'time',
      });
      onChange(added);
      closeAddModal();
      return;
    }

    const clientId = createId('step');
    const base = createEmptyAdvancedSection(clientId, addMode.parentClientId);
    const configured = { ...base, phaseType: newPhase, durationType: newDurationType };
    if (addMode.parentClientId && customGroups.has(addMode.parentClientId)) {
      const group = sections.find(section => section.clientId === addMode.parentClientId);
      if (group) {
        const expanded = Array.from({ length: group.repetitions }, (_, index) => ({
          ...configured,
          clientId: `${clientId}-rep-${index + 1}`,
          repetitionIndex: index + 1,
        }));
        onChange(insertAdvancedSectionsAfterSubtree(sections, addMode.parentClientId, expanded));
        closeAddModal();
        return;
      }
    }
    onChange(
      addMode.parentClientId
        ? insertAdvancedSectionsAfterSubtree(sections, addMode.parentClientId, [configured])
        : [...sections, configured],
    );
    closeAddModal();
  };

  const toggleGroupMode = (groupId: string, custom: boolean) => {
    setCustomGroups(previous => {
      const next = new Set(previous);
      if (custom) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
    onChange(custom ? expandGroupRepetitions(sections, groupId) : collapseGroupRepetitions(sections, groupId));
  };

  const groupSummary = (group: AdvancedSectionDraft, children: AdvancedSectionDraft[]) => {
    const firstChild = children.find(child => !child.isGroup && child.repetitionIndex == null) ?? children[0];
    const distance = firstChild ? formatDistance(firstChild, sport, distanceUnit, toDisplayDistance) : '';
    return `${group.repetitions} × ${distance || t(PHASE_LABEL_KEYS[group.phaseType])}`;
  };

  return (
    <View style={styles.container}>
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
              metricPriority={metricPriority}
              onChange={updateSection}
              onDelete={sections.length > 1 ? () => deleteSection(section.clientId) : undefined}
              expanded={!collapsedSections.has(section.clientId)}
              onToggle={() => toggleCollapsed(section.clientId)}
            />
          );
        }

        const commonChildren = renderedSections.filter(
          child => child.parentClientId === section.clientId && child.repetitionIndex == null,
        );
        const repeatedChildren = renderedSections.filter(
          child => child.parentClientId === section.clientId && child.repetitionIndex != null,
        );
        const isCustom = customGroups.has(section.clientId);
        const repetitionIndexes = Array.from(
          new Set(
            repeatedChildren.map(child => child.repetitionIndex).filter((value): value is number => value != null),
          ),
        ).sort((a, b) => a - b);
        const groupCollapsed = collapsedGroups.has(section.clientId);
        const accent = phaseColor(section.phaseType, themeColors);

        return (
          <View key={section.clientId} style={[styles.groupCard, dynamicStyles.glassCard, { borderLeftColor: accent }]}>
            <View style={styles.cardHeader}>
              <Pressable
                style={styles.cardHeaderCopy}
                onPress={() =>
                  setCollapsedGroups(previous => {
                    const next = new Set(previous);
                    if (next.has(section.clientId)) next.delete(section.clientId);
                    else next.add(section.clientId);
                    return next;
                  })
                }
                accessibilityRole="button"
              >
                <Text style={[styles.phaseLabel, { color: accent }]}>{t(PHASE_LABEL_KEYS[section.phaseType])}</Text>
                <Text style={[styles.cardSummary, { color: themeColors.textPrimary }]}>
                  {groupSummary(section, commonChildren.length > 0 ? commonChildren : repeatedChildren)}
                </Text>
              </Pressable>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => deleteSection(section.clientId)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('training.removeStep')}
                >
                  <Trash2 size={18} color={themeColors.danger} />
                </Pressable>
                {groupCollapsed ? (
                  <ChevronDown size={21} color={themeColors.primary} />
                ) : (
                  <ChevronUp size={21} color={themeColors.primary} />
                )}
              </View>
            </View>

            {!groupCollapsed && (
              <View style={styles.groupBody}>
                <View style={styles.sameValueRow}>
                  <View style={styles.sameValueCopy}>
                    <Text style={[styles.sameValueTitle, { color: themeColors.textPrimary }]}>
                      {t('training.sameValueForAll')}
                    </Text>
                    <Text
                      style={[
                        styles.sameValueStatus,
                        { color: isCustom ? themeColors.textSecondary : themeColors.primary },
                      ]}
                    >
                      {isCustom ? t('training.sameValueDisabled') : t('training.sameValueEnabled')}
                    </Text>
                  </View>
                  <Switch
                    value={!isCustom}
                    onValueChange={value => toggleGroupMode(section.clientId, !value)}
                    trackColor={{ false: themeColors.textSecondary, true: themeColors.primary + '60' }}
                    thumbColor={!isCustom ? themeColors.primary : themeColors.background}
                    accessibilityLabel={t('training.sameValueForAll')}
                  />
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
                      metricPriority={metricPriority}
                      onChange={updateSection}
                      onDelete={() => deleteSection(child.clientId)}
                      expanded={!collapsedSections.has(child.clientId)}
                      onToggle={() => toggleCollapsed(child.clientId)}
                      compact
                    />
                  ))}

                {isCustom &&
                  repetitionIndexes.map(index => (
                    <View key={`${section.clientId}-rep-${index}`} style={styles.repetitionCard}>
                      <View style={styles.repetitionHeader}>
                        <View style={[styles.repetitionMarker, { backgroundColor: themeColors.primary }]} />
                        <Text style={[styles.repetitionTitle, { color: themeColors.primary }]}>
                          {t('training.repetitionNumber', { number: index })}
                        </Text>
                      </View>
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
                            metricPriority={metricPriority}
                            onChange={updateSection}
                            onDelete={() => deleteSection(child.clientId)}
                            expanded={!collapsedSections.has(child.clientId)}
                            onToggle={() => toggleCollapsed(child.clientId)}
                            compact
                          />
                        ))}
                    </View>
                  ))}

                <Pressable style={styles.inlineAdd} onPress={() => openAddModal('step', section.clientId)}>
                  <Plus size={17} color={themeColors.primary} />
                  <Text style={[styles.inlineAddText, { color: themeColors.primary }]}>{t('training.addStep')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      {(() => {
        const totals = calculateAdvancedTotals(renderedSections);
        return (
          <View style={[styles.totalsCard, dynamicStyles.glassCard]}>
            <Text style={[styles.totalsTitle, { color: themeColors.textSecondary }]}>{t('training.totalTab')}</Text>
            <View style={styles.totalsRow}>
              <Text style={[styles.totalsValue, { color: themeColors.textPrimary }]}>
                {formatDuration(totals.durationS) || '—'}
              </Text>
              <Text style={[styles.totalsValue, { color: themeColors.textPrimary }]}>
                {totals.distanceM == null ? '—' : `${toDisplayDistance(totals.distanceM)} ${distanceUnit}`}
              </Text>
            </View>
          </View>
        );
      })()}

      <View style={styles.bottomActions}>
        <Pressable
          style={[styles.addButton, { backgroundColor: themeColors.primary }]}
          onPress={() => openAddModal('step')}
        >
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.addButtonText}>{t('training.addStep')}</Text>
        </Pressable>
        <Pressable
          style={[styles.addButton, { backgroundColor: themeColors.primary + '18' }]}
          onPress={() => openAddModal('group')}
        >
          <Plus size={18} color={themeColors.primary} />
          <Text style={[styles.addButtonText, { color: themeColors.primary }]}>{t('training.addRepeatedBlock')}</Text>
        </Pressable>
      </View>

      <Modal visible={addMode != null} transparent animationType="fade" onRequestClose={closeAddModal}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeAddModal} />
          <View style={[styles.modalCard, dynamicStyles.glassCard]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                  {addMode?.kind === 'group' ? t('training.addRepeatedBlock') : t('training.addStep')}
                </Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  {t('training.chooseStepType')}
                </Text>
              </View>
              <Pressable onPress={closeAddModal} hitSlop={8} accessibilityLabel={t('training.close')}>
                <X size={21} color={themeColors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>{t('training.phases')}</Text>
            <View style={styles.modalOptions}>
              {PHASES.map(phase => (
                <Pressable
                  key={phase}
                  onPress={() => setNewPhase(phase)}
                  style={[
                    styles.modalOption,
                    { borderColor: newPhase === phase ? themeColors.primary : themeColors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      { color: newPhase === phase ? themeColors.primary : themeColors.textPrimary },
                    ]}
                  >
                    {t(PHASE_LABEL_KEYS[phase])}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>
              {t('training.chooseDurationType')}
            </Text>
            <View style={styles.modalOptions}>
              {DURATION_TYPES.map(durationType => (
                <Pressable
                  key={durationType}
                  onPress={() => setNewDurationType(durationType)}
                  style={[
                    styles.modalOption,
                    { borderColor: newDurationType === durationType ? themeColors.primary : themeColors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      { color: newDurationType === durationType ? themeColors.primary : themeColors.textPrimary },
                    ]}
                  >
                    {t(DURATION_LABEL_KEYS[durationType])}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.modalHint, { color: themeColors.textSecondary }]}>
              {t(DURATION_HINT_KEYS[newDurationType])}
            </Text>

            {addMode?.kind === 'group' && (
              <View style={styles.repetitionInputRow}>
                <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>
                  {t('training.repetitions')}
                </Text>
                <TextInput
                  style={[styles.repetitionInput, dynamicStyles.input, { color: themeColors.textPrimary }]}
                  {...INTEGER_INPUT_PROPS}
                  value={newRepetitions}
                  onChangeText={setNewRepetitions}
                  placeholder="4"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
            )}

            <Pressable
              style={[styles.confirmButton, { backgroundColor: themeColors.primary }]}
              onPress={addConfiguredStep}
            >
              <Text style={styles.confirmButtonText}>{t('common.accept')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.l },
  sectionCard: { borderRadius: borderRadius.l, borderLeftWidth: 5, padding: spacing.l },
  compactCard: { marginTop: spacing.m, padding: spacing.m, borderRadius: borderRadius.l, borderLeftWidth: 3 },
  cardHeader: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  cardHeaderCopy: { flex: 1 },
  phaseLabel: { ...typography.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  cardSummary: { ...typography.h4, marginTop: 3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  cardBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(127,127,127,0.2)',
    marginTop: spacing.m,
    paddingTop: spacing.m,
  },
  choiceSectionLabel: { ...typography.caption, fontWeight: '800', marginTop: spacing.s, marginBottom: spacing.s },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  choice: {
    minHeight: 38,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    justifyContent: 'center',
  },
  choiceText: { ...typography.caption, fontWeight: '700' },
  choiceHint: { ...typography.caption, lineHeight: 18, marginTop: spacing.s },
  primaryField: { marginTop: spacing.l },
  secondaryField: { marginTop: spacing.m },
  intensityField: { marginTop: spacing.m },
  fieldLabel: { ...typography.caption, marginBottom: spacing.s },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    fontSize: 17,
  },
  compactInput: { minHeight: 48, fontSize: 16 },
  unitLabel: { position: 'absolute', right: spacing.m, bottom: 17, fontSize: 12 },
  groupCard: { borderRadius: borderRadius.l, borderLeftWidth: 5, padding: spacing.l },
  groupBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(127,127,127,0.2)',
    marginTop: spacing.m,
    paddingTop: spacing.m,
  },
  sameValueRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  sameValueCopy: { flex: 1 },
  sameValueTitle: { ...typography.body, fontWeight: '700' },
  sameValueStatus: { ...typography.caption, marginTop: 2 },
  repetitionCard: {
    marginTop: spacing.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(127,127,127,0.22)',
    paddingTop: spacing.l,
  },
  repetitionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginBottom: spacing.m },
  repetitionMarker: { width: 4, height: 22, borderRadius: borderRadius.full },
  repetitionTitle: { ...typography.body, fontWeight: '800' },
  inlineAdd: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.m },
  inlineAddText: { ...typography.caption, fontWeight: '800' },
  totalsCard: { borderRadius: borderRadius.l, padding: spacing.m, gap: spacing.s },
  totalsTitle: { ...typography.body, fontWeight: '700' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.s },
  totalsValue: { ...typography.h3, fontWeight: '800' },
  bottomActions: { gap: spacing.s },
  addButton: {
    minHeight: 52,
    borderRadius: borderRadius.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addButtonText: { ...typography.body, color: '#FFFFFF', fontWeight: '800' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCard: {
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
    padding: spacing.l,
    gap: spacing.s,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.s },
  modalTitle: { ...typography.h3 },
  modalSubtitle: { ...typography.caption, marginTop: spacing.xs },
  modalLabel: { ...typography.caption, fontWeight: '800', marginTop: spacing.s },
  modalOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  modalOption: {
    minHeight: 42,
    borderWidth: 1.5,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.s,
    justifyContent: 'center',
  },
  modalOptionText: { ...typography.caption, fontWeight: '700' },
  modalHint: { ...typography.caption, lineHeight: 18, marginTop: spacing.xs },
  repetitionInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  repetitionInput: {
    minWidth: 72,
    minHeight: 44,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.s,
    textAlign: 'center',
    fontSize: 16,
  },
  confirmButton: {
    minHeight: 50,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.s,
  },
  confirmButtonText: { ...typography.body, color: '#FFFFFF', fontWeight: '800' },
});
