import React, { memo, useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import type { TranslationKey } from '../../../i18n/locales/en';
import type {
  TrainingExerciseCandidate,
  TrainingExerciseResolution,
} from '../../../modules/training/services/trainingPlanImportExerciseResolver';

type Translate = (key: TranslationKey, options?: Record<string, unknown>) => string;

type TrainingExerciseResolutionPreviewProps = {
  resolutions: TrainingExerciseResolution[];
  onSelect: (resolutionKey: string, candidateId: string) => void;
  onSearch: (resolutionKey: string, query: string) => Promise<void>;
  translate: Translate;
};

const candidateDetails = (candidate: TrainingExerciseCandidate, translate: Translate): string => {
  const details = [candidate.primary_muscle, candidate.equipment, candidate.exercise_type]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' · ');
  return details || translate('training.trainingExerciseCatalogDetailsUnavailable');
};

const TrainingExerciseResolutionRow = memo(function TrainingExerciseResolutionRow({
  resolution,
  onSelect,
  onSearch,
  translate,
}: {
  resolution: TrainingExerciseResolution;
  onSelect: (resolutionKey: string, candidateId: string) => void;
  onSearch: (resolutionKey: string, query: string) => Promise<void>;
  translate: Translate;
}) {
  const { colors } = useTrainingStyles();
  const [query, setQuery] = useState(resolution.sourceName);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2 || isSearching) return;
    setIsSearching(true);
    try {
      await onSearch(resolution.resolutionKey, trimmedQuery);
    } finally {
      setIsSearching(false);
    }
  }, [isSearching, onSearch, query, resolution.resolutionKey]);

  return (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={styles.rowHeader}>
        <View style={styles.rowCopy}>
          <Text style={[styles.sourceLabel, { color: colors.textSecondary }]}>
            {translate('training.trainingExerciseSourceName')}
          </Text>
          <Text style={[styles.sourceName, { color: colors.textPrimary }]}>{resolution.sourceName}</Text>
        </View>
        {resolution.selectedCandidate ? (
          <Text style={[styles.status, { color: colors.success }]}>
            {translate('training.trainingExerciseResolved')}
          </Text>
        ) : (
          <Text style={[styles.status, { color: colors.warning }]}>
            {translate('training.trainingExerciseNeedsSelection')}
          </Text>
        )}
      </View>

      {resolution.selectedCandidate ? (
        <Text style={[styles.selected, { color: colors.textSecondary }]}>
          {translate('training.trainingExerciseSelectedCandidate', {
            name: resolution.selectedCandidate.base_name_es ?? resolution.selectedCandidate.base_name_en ?? '',
          })}
        </Text>
      ) : null}

      <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Search size={18} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void handleSearch()}
          placeholder={translate('training.trainingExerciseSearchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.textPrimary }]}
          returnKeyType="search"
          accessibilityLabel={translate('training.trainingExerciseSearchAccessibility', {
            exercise: resolution.sourceName,
          })}
        />
        <TouchableOpacity
          onPress={() => void handleSearch()}
          disabled={isSearching || query.trim().length < 2}
          style={[styles.searchButton, { backgroundColor: colors.primary, opacity: isSearching ? 0.65 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={translate('training.trainingExerciseSearchButtonAccessibility')}
          accessibilityState={{ disabled: isSearching || query.trim().length < 2, busy: isSearching }}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Search size={17} color={colors.white} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.candidates}>
        {resolution.candidates.map(candidate => {
          const candidateName = candidate.base_name_es ?? candidate.base_name_en ?? '';
          const isSelected = resolution.selectedCandidate?.id === candidate.id;
          return (
            <TouchableOpacity
              key={candidate.id}
              onPress={() => onSelect(resolution.resolutionKey, candidate.id)}
              style={[
                styles.candidate,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.primary + '14' : colors.surface,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={translate('training.trainingExerciseSelectCandidateAccessibility', {
                candidate: candidateName,
              })}
            >
              <Text style={[styles.candidateName, { color: colors.textPrimary }]}>{candidateName}</Text>
              <Text style={[styles.candidateDetails, { color: colors.textSecondary }]}>
                {candidateDetails(candidate, translate)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

export const TrainingExerciseResolutionPreview = memo(function TrainingExerciseResolutionPreview({
  resolutions,
  onSelect,
  onSearch,
  translate,
}: TrainingExerciseResolutionPreviewProps) {
  const { colors } = useTrainingStyles();
  const renderItem = useCallback(
    ({ item }: { item: TrainingExerciseResolution }) => (
      <TrainingExerciseResolutionRow resolution={item} onSelect={onSelect} onSearch={onSearch} translate={translate} />
    ),
    [onSearch, onSelect, translate],
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {translate('training.trainingExerciseMatchesTitle')}
      </Text>
      <Text style={[styles.help, { color: colors.textSecondary }]}>
        {translate('training.trainingExerciseMatchesHelp')}
      </Text>
      <FlatList
        data={resolutions}
        renderItem={renderItem}
        keyExtractor={item => item.resolutionKey}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginTop: 18 },
  title: { fontSize: 18, fontWeight: '800' },
  help: { marginTop: 5, fontSize: 14, lineHeight: 20 },
  separator: { height: 12 },
  row: { borderWidth: 1, borderRadius: 16, padding: 14 },
  rowHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowCopy: { flex: 1 },
  sourceLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  sourceName: { marginTop: 3, fontSize: 16, fontWeight: '800' },
  status: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  selected: { marginTop: 8, fontSize: 14, lineHeight: 19 },
  searchRow: {
    minHeight: 46,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, minHeight: 44, fontSize: 15 },
  searchButton: {
    width: 42,
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  candidates: { marginTop: 10, gap: 8 },
  candidate: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  candidateName: { fontSize: 15, fontWeight: '700' },
  candidateDetails: { marginTop: 2, fontSize: 12 },
});
