import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronRight, Footprints, Star } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../context/ThemeContext';
import { Alert } from '../../../components/common/Alert';
import { useEnduranceSessions } from '../../../hooks/useEnduranceSessions';
import { useRunningShoes } from '../hooks/useRunningShoes';
import { RunningShoeWithMileage } from '../services/runningShoesService';
import { TrainingScreenNavigationProp } from '../../../types/navigation.types';
import { borderRadius, spacing, typography } from '../../../theme';

type RunningShoeAssignmentProps = {
  sessionId: string;
  runningShoeId: string | null;
};

export const RunningShoeAssignment = ({ sessionId, runningShoeId }: RunningShoeAssignmentProps) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const { shoes, isLoading } = useRunningShoes();
  const { assignRunningShoe } = useEnduranceSessions({ enabled: false });
  const [selectorVisible, setSelectorVisible] = useState(false);

  const selectedShoe = shoes.find(shoe => shoe.id === runningShoeId);

  const assignShoe = assignRunningShoe.mutateAsync;
  const assign = useCallback(
    async (shoeId: string | null) => {
      try {
        await assignShoe({ sessionId, runningShoeId: shoeId });
        setSelectorVisible(false);
        Alert.alert(t('training.runningShoeSelectorTitle'), t('training.runningShoeSaved'));
      } catch {
        Alert.alert(t('training.runningShoeSelectorTitle'), t('training.runningShoeSaveError'));
      }
    },
    [assignShoe, sessionId, t],
  );

  const renderShoeOption = useCallback(
    ({ item: shoe }: { item: RunningShoeWithMileage }) => (
      <TouchableOpacity
        style={[styles.option, { borderBottomColor: colors.border }]}
        onPress={() => void assign(shoe.id)}
        disabled={assignRunningShoe.isPending}
      >
        <View style={styles.optionTextBlock}>
          <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{shoe.name}</Text>
          {shoe.is_default && (
            <View style={styles.defaultHint}>
              <Star size={12} color={colors.primary} />
              <Text style={[styles.defaultText, { color: colors.primary }]}>
                {t('training.runningShoeRecommended')}
              </Text>
            </View>
          )}
        </View>
        {runningShoeId === shoe.id && <Check size={18} color={colors.primary} />}
      </TouchableOpacity>
    ),
    [assign, assignRunningShoe.isPending, colors, runningShoeId, t],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.selectedOptionBackground }]}>
          <Footprints size={18} color={colors.primary} />
        </View>
        <View style={styles.labelBlock}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('training.runningShoeSelectorLabel')}</Text>
          <Text style={[styles.value, { color: colors.textSecondary }]}>
            {selectedShoe?.name ?? t('training.runningShoeNone')}
          </Text>
        </View>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : shoes.length > 0 ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('training.runningShoeSelectorTitle')}
            style={styles.changeButton}
            onPress={() => setSelectorVisible(true)}
          >
            <ChevronRight size={21} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {!isLoading && shoes.length === 0 ? (
        <View style={[styles.emptyActions, { borderTopColor: colors.border }]}>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('training.runningShoeNoShoes')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settings', { screen: 'RunningShoesSettings' })}>
            <Text style={[styles.manageText, { color: colors.primary }]}>{t('training.runningShoeManage')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal
        visible={selectorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectorVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setSelectorVisible(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.surfaceSolid }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {t('training.runningShoeSelectorTitle')}
            </Text>
            <TouchableOpacity
              style={[styles.option, { borderBottomColor: colors.border }]}
              onPress={() => void assign(null)}
              disabled={assignRunningShoe.isPending}
            >
              <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{t('training.runningShoeNone')}</Text>
              {!runningShoeId && <Check size={18} color={colors.primary} />}
            </TouchableOpacity>
            <FlatList
              style={styles.optionList}
              data={shoes}
              keyExtractor={shoe => shoe.id}
              renderItem={renderShoeOption}
              extraData={runningShoeId}
            />
            <TouchableOpacity style={styles.cancelButton} onPress={() => setSelectorVisible(false)}>
              <Text style={[styles.cancelText, { color: colors.primary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    marginHorizontal: spacing.m,
    marginTop: spacing.m,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  icon: { width: 36, height: 36, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  labelBlock: { flex: 1, gap: 2 },
  label: { ...typography.body, fontWeight: '600' },
  value: { ...typography.caption },
  changeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emptyActions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.m,
    paddingTop: spacing.m,
    gap: spacing.s,
  },
  hint: { ...typography.caption, lineHeight: 18 },
  manageText: { ...typography.body, fontWeight: '600' },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.m },
  modalCard: { width: '100%', maxWidth: 440, maxHeight: '85%', borderRadius: borderRadius.l, padding: spacing.m },
  optionList: { flexGrow: 0, flexShrink: 1 },
  modalTitle: { ...typography.h3, marginBottom: spacing.s },
  option: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.s,
  },
  optionTextBlock: { gap: 3 },
  optionLabel: { ...typography.body },
  defaultHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  defaultText: { ...typography.caption, fontWeight: '600' },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  cancelText: { ...typography.body, fontWeight: '600' },
});
