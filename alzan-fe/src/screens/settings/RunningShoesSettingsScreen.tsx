import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Check, CircleAlert, Footprints, Pencil, Plus, Star } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { Alert } from '../../components/common/Alert';
import { CalendarDatePickerModal } from '../../components/common/CalendarDatePickerModal';
import { formatLocalizedDate } from '../../i18n/dateLocale';
import { useRunningShoes } from '../../modules/training/hooks/useRunningShoes';
import { RunningShoeWithMileage } from '../../modules/training/services/runningShoesService';
import { getRunningShoeMileage, getRunningShoeMileageState } from '../../modules/training/helpers/runningShoeMileage';
import { borderRadius, spacing, typography } from '../../theme';

type DateField = 'purchase' | 'inUseSince';

const today = () => format(new Date(), 'yyyy-MM-dd');
const displayDate = (value: string) => formatLocalizedDate(parseISO(value), { en: 'MMM d, yyyy', es: 'd MMM yyyy' });

export const RunningShoesSettingsScreen = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { shoes, isLoading, isError, refetch, createRunningShoe, updateRunningShoe, setDefaultRunningShoe } =
    useRunningShoes();

  const [formVisible, setFormVisible] = useState(false);
  const [editingShoe, setEditingShoe] = useState<RunningShoeWithMileage | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [inUseSince, setInUseSince] = useState(today());
  const [recommendedMaximum, setRecommendedMaximum] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [dateField, setDateField] = useState<DateField | null>(null);
  const [hasManuallySetStartDate, setHasManuallySetStartDate] = useState(false);

  const isSaving = createRunningShoe.isPending || updateRunningShoe.isPending || setDefaultRunningShoe.isPending;
  const selectedPickerDate = useMemo(() => {
    const value = dateField === 'purchase' ? purchaseDate : inUseSince;
    return value ? parseISO(value) : new Date();
  }, [dateField, inUseSince, purchaseDate]);

  const resetForm = () => {
    setFormVisible(false);
    setEditingShoe(null);
    setName('');
    setBrand('');
    setModel('');
    setPurchaseDate(null);
    setInUseSince(today());
    setRecommendedMaximum('');
    setIsDefault(false);
    setDateField(null);
    setHasManuallySetStartDate(false);
  };

  const openCreateForm = () => {
    setEditingShoe(null);
    setName('');
    setBrand('');
    setModel('');
    setPurchaseDate(null);
    setInUseSince(today());
    setRecommendedMaximum('');
    setIsDefault(shoes.length === 0);
    setHasManuallySetStartDate(false);
    setFormVisible(true);
  };

  const openEditForm = (shoe: RunningShoeWithMileage) => {
    setEditingShoe(shoe);
    setName(shoe.name);
    setBrand(shoe.brand ?? '');
    setModel(shoe.model ?? '');
    setPurchaseDate(shoe.purchase_date);
    setInUseSince(shoe.in_use_since);
    setRecommendedMaximum(shoe.recommended_max_km?.toString() ?? '');
    setIsDefault(shoe.is_default);
    setHasManuallySetStartDate(true);
    setFormVisible(true);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setDateField(null);
      return;
    }
    if (!selectedDate || !dateField) return;

    const value = format(selectedDate, 'yyyy-MM-dd');
    if (dateField === 'purchase') {
      setPurchaseDate(value);
      if (!editingShoe && !hasManuallySetStartDate) setInUseSince(value);
    } else {
      setInUseSince(value);
      setHasManuallySetStartDate(true);
    }

    if (Platform.OS !== 'ios') setDateField(null);
  };

  const saveShoe = async () => {
    if (!name.trim()) {
      Alert.alert(t('settings.runningShoesTitle'), t('settings.runningShoesNameRequired'));
      return;
    }

    const parsedMaximum = recommendedMaximum.trim() ? Number(recommendedMaximum.replace(',', '.')) : null;
    if (parsedMaximum !== null && (!Number.isFinite(parsedMaximum) || parsedMaximum <= 0)) {
      Alert.alert(t('settings.runningShoesTitle'), t('settings.runningShoesMaximumInvalid'));
      return;
    }

    const shoeData = {
      name: name.trim(),
      brand: brand.trim() || null,
      model: model.trim() || null,
      purchase_date: purchaseDate,
      in_use_since: inUseSince,
      recommended_max_km: parsedMaximum,
    };

    try {
      let assignedSessions = 0;
      if (editingShoe) {
        assignedSessions = await updateRunningShoe.mutateAsync({ shoeId: editingShoe.id, updates: shoeData });
        if (isDefault !== editingShoe.is_default) {
          await setDefaultRunningShoe.mutateAsync({ shoeId: editingShoe.id, makeDefault: isDefault });
        }
      } else {
        const result = await createRunningShoe.mutateAsync({ ...shoeData, is_default: isDefault });
        assignedSessions = result.assigned_sessions;
      }

      const wasEditing = !!editingShoe;
      resetForm();
      const message =
        assignedSessions > 0
          ? t('settings.runningShoesCreatedMessage', { count: assignedSessions })
          : wasEditing
            ? t('settings.runningShoesSaved')
            : undefined;
      Alert.alert(t(wasEditing ? 'settings.runningShoesUpdatedTitle' : 'settings.runningShoesCreatedTitle'), message);
    } catch {
      Alert.alert(t('settings.runningShoesTitle'), t('settings.runningShoesSaveError'));
    }
  };

  const chooseDefault = async (shoe: RunningShoeWithMileage) => {
    try {
      await setDefaultRunningShoe.mutateAsync({ shoeId: shoe.id, makeDefault: true });
    } catch {
      Alert.alert(t('settings.runningShoesTitle'), t('settings.runningShoesSaveError'));
    }
  };

  const renderShoe = (shoe: RunningShoeWithMileage) => {
    const totalKm = getRunningShoeMileage(shoe.total_distance_m);
    const recommendedKm = shoe.recommended_max_km;
    const mileageState = getRunningShoeMileageState(totalKm, recommendedKm);
    const progress = recommendedKm ? Math.min(100, (totalKm / recommendedKm) * 100) : 0;
    const remaining = recommendedKm ? Math.max(0, recommendedKm - totalKm) : 0;
    const exceeded = recommendedKm ? Math.max(0, totalKm - recommendedKm) : 0;
    const shoeDescription = [shoe.brand, shoe.model].filter(Boolean).join(' · ');

    return (
      <View
        key={shoe.id}
        style={[styles.shoeCard, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}
      >
        <View style={styles.shoeHeader}>
          <View style={[styles.shoeIcon, { backgroundColor: colors.selectedOptionBackground }]}>
            <Footprints size={21} color={colors.primary} />
          </View>
          <View style={styles.shoeTitleBlock}>
            <Text style={[styles.shoeName, { color: colors.textPrimary }]}>{shoe.name}</Text>
            {!!shoeDescription && (
              <Text style={[styles.shoeMeta, { color: colors.textSecondary }]}>{shoeDescription}</Text>
            )}
            <Text style={[styles.shoeMeta, { color: colors.textSecondary }]}>
              {t('settings.runningShoesUsedOn', { date: displayDate(shoe.in_use_since) })}
            </Text>
          </View>
          {shoe.is_default ? (
            <View style={[styles.defaultBadge, { backgroundColor: colors.selectedOptionBackground }]}>
              <Check size={14} color={colors.primary} />
              <Text style={[styles.defaultBadgeText, { color: colors.primary }]}>
                {t('settings.runningShoesDefaultBadge')}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('settings.runningShoesDefault')}
              style={styles.iconButton}
              onPress={() => void chooseDefault(shoe)}
              disabled={setDefaultRunningShoe.isPending}
            >
              <Star size={19} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.mileageRow}>
          <Text style={[styles.mileageValue, { color: colors.textPrimary }]}>
            {t('settings.runningShoesMileage', {
              distance: totalKm.toLocaleString(undefined, { maximumFractionDigits: 1 }),
            })}
          </Text>
          <Text style={[styles.shoeMeta, { color: colors.textSecondary }]}>
            {recommendedKm
              ? `/ ${recommendedKm.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`
              : t('settings.runningShoesNoLimit')}
          </Text>
        </View>

        {recommendedKm !== null && (
          <>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progress}%`,
                    backgroundColor: mileageState === 'within_limit' ? colors.primary : colors.warning,
                  },
                ]}
              />
            </View>
            <View style={styles.warningRow}>
              {mileageState === 'within_limit' ? null : <CircleAlert size={16} color={colors.warning} />}
              <Text
                style={[
                  styles.limitMessage,
                  { color: mileageState === 'within_limit' ? colors.textSecondary : colors.warning },
                ]}
              >
                {mileageState === 'reached'
                  ? t('settings.runningShoesLimitReached')
                  : mileageState === 'exceeded'
                    ? t('settings.runningShoesLimitExceeded', {
                        distance: exceeded.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                      })
                    : t('settings.runningShoesLimitRemaining', {
                        distance: remaining.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                      })}
              </Text>
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.editButton, { borderTopColor: colors.border }]}
          onPress={() => openEditForm(shoe)}
        >
          <Pencil size={16} color={colors.primary} />
          <Text style={[styles.editButtonText, { color: colors.primary }]}>{t('settings.runningShoesEdit')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderDatePicker = () => {
    if (!dateField) return null;
    if (Platform.OS === 'web') {
      return (
        <CalendarDatePickerModal
          visible
          value={selectedPickerDate}
          title={t(dateField === 'purchase' ? 'settings.runningShoesPurchaseDate' : 'settings.runningShoesInUseSince')}
          maximumDate={new Date()}
          onCancel={() => setDateField(null)}
          onConfirm={date =>
            handleDateChange({ type: 'set', nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } }, date)
          }
        />
      );
    }
    const picker = (
      <DateTimePicker
        value={selectedPickerDate}
        mode="date"
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        maximumDate={new Date()}
        onChange={handleDateChange}
        style={Platform.OS === 'ios' ? styles.iosDatePicker : undefined}
      />
    );

    if (Platform.OS !== 'ios') return picker;
    return (
      <Modal transparent animationType="slide" visible onRequestClose={() => setDateField(null)}>
        <View style={[styles.dateModalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setDateField(null)} />
          <View style={[styles.dateModalContent, { backgroundColor: colors.surfaceSolid }]}>
            <TouchableOpacity style={styles.dateDoneButton} onPress={() => setDateField(null)}>
              <Text style={[styles.dateDoneText, { color: colors.primary }]}>{t('common.done')}</Text>
            </TouchableOpacity>
            {picker}
          </View>
        </View>
      </Modal>
    );
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.surfaceSolid, borderColor: colors.border, color: colors.textPrimary },
  ];
  const labelStyle = [styles.inputLabel, { color: colors.textSecondary }];

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {t('settings.runningShoesDescription')}
          </Text>

          {isLoading ? (
            <ActivityIndicator style={styles.centerState} size="large" color={colors.primary} />
          ) : isError ? (
            <View style={styles.centerState}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t('settings.runningShoesLoadError')}
              </Text>
              <TouchableOpacity onPress={() => void refetch()}>
                <Text style={[styles.retryText, { color: colors.primary }]}>{t('settings.runningShoesRetry')}</Text>
              </TouchableOpacity>
            </View>
          ) : shoes.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}>
              <Footprints size={32} color={colors.primary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('settings.runningShoesEmpty')}</Text>
            </View>
          ) : (
            <View style={styles.shoeList}>{shoes.map(renderShoe)}</View>
          )}

          <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={openCreateForm}>
            <Plus size={19} color={colors.white} />
            <Text style={[styles.addButtonText, { color: colors.white }]}>{t('settings.runningShoesAdd')}</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={formVisible} animationType="slide" onRequestClose={resetForm}>
          <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.screen}>
            <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
              <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.formHeader}>
                  <TouchableOpacity onPress={resetForm} disabled={isSaving}>
                    <Text style={[styles.formAction, { color: colors.primary }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
                    {t(editingShoe ? 'settings.runningShoesEdit' : 'settings.runningShoesAdd')}
                  </Text>
                  <TouchableOpacity onPress={() => void saveShoe()} disabled={isSaving}>
                    {isSaving ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.formAction, { color: colors.primary }]}>{t('common.save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
                  <Text style={labelStyle}>{t('settings.runningShoesName')}</Text>
                  <TextInput value={name} onChangeText={setName} style={inputStyle} returnKeyType="next" />

                  <Text style={labelStyle}>{t('settings.runningShoesBrand')}</Text>
                  <TextInput value={brand} onChangeText={setBrand} style={inputStyle} returnKeyType="next" />

                  <Text style={labelStyle}>{t('settings.runningShoesModel')}</Text>
                  <TextInput value={model} onChangeText={setModel} style={inputStyle} returnKeyType="next" />

                  <Text style={labelStyle}>{t('settings.runningShoesPurchaseDate')}</Text>
                  <TouchableOpacity
                    style={[styles.dateButton, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}
                    onPress={() => setDateField('purchase')}
                  >
                    <CalendarDays size={18} color={colors.primary} />
                    <Text style={[styles.dateButtonText, { color: colors.textPrimary }]}>
                      {purchaseDate ? displayDate(purchaseDate) : t('settings.runningShoesNoPurchaseDate')}
                    </Text>
                  </TouchableOpacity>
                  {purchaseDate && (
                    <TouchableOpacity onPress={() => setPurchaseDate(null)}>
                      <Text style={[styles.clearDateText, { color: colors.primary }]}>{t('common.clear')}</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={labelStyle}>{t('settings.runningShoesInUseSince')}</Text>
                  <TouchableOpacity
                    style={[styles.dateButton, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}
                    onPress={() => setDateField('inUseSince')}
                  >
                    <CalendarDays size={18} color={colors.primary} />
                    <Text style={[styles.dateButtonText, { color: colors.textPrimary }]}>
                      {displayDate(inUseSince)}
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.formHint, { color: colors.textSecondary }]}>
                    {t('settings.runningShoesBackfillHint')}
                  </Text>

                  <Text style={labelStyle}>{t('settings.runningShoesRecommendedMaximum')}</Text>
                  <TextInput
                    value={recommendedMaximum}
                    onChangeText={setRecommendedMaximum}
                    style={inputStyle}
                    keyboardType="decimal-pad"
                  />

                  <View style={[styles.defaultSwitchRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.defaultSwitchLabel, { color: colors.textPrimary }]}>
                      {t('settings.runningShoesDefault')}
                    </Text>
                    <Switch value={isDefault} onValueChange={setIsDefault} trackColor={{ true: colors.primary }} />
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </LinearGradient>
        </Modal>

        {renderDatePicker()}
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.m, paddingBottom: 120 },
  description: { ...typography.body, marginBottom: spacing.m, lineHeight: 23 },
  shoeList: { gap: spacing.m },
  shoeCard: { borderWidth: 1, borderRadius: borderRadius.l, padding: spacing.m },
  shoeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  shoeIcon: { width: 42, height: 42, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  shoeTitleBlock: { flex: 1, gap: 2 },
  shoeName: { ...typography.h4 },
  shoeMeta: { ...typography.caption },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  defaultBadgeText: { fontSize: 11, fontWeight: '600' },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  mileageRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.s, marginTop: spacing.m },
  mileageValue: { fontSize: 22, fontWeight: '700' },
  progressTrack: { height: 7, borderRadius: borderRadius.full, overflow: 'hidden', marginTop: spacing.s },
  progressFill: { height: '100%', borderRadius: borderRadius.full },
  warningRow: { minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  limitMessage: { ...typography.caption, flex: 1 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingTop: spacing.m,
    marginTop: spacing.s,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editButtonText: { ...typography.body, fontWeight: '600' },
  emptyCard: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.m,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.l,
  },
  emptyText: { ...typography.body, textAlign: 'center', lineHeight: 23 },
  retryText: { ...typography.body, fontWeight: '600', marginTop: spacing.s },
  centerState: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  addButton: {
    minHeight: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.s,
    borderRadius: borderRadius.full,
    marginTop: spacing.l,
  },
  addButtonText: { ...typography.body, fontWeight: '700' },
  formHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
  },
  formTitle: { ...typography.h4 },
  formAction: { ...typography.body, fontWeight: '600' },
  formContent: { padding: spacing.m, paddingBottom: spacing.xl },
  inputLabel: { ...typography.caption, marginTop: spacing.m, marginBottom: spacing.xs },
  input: { minHeight: 48, borderWidth: 1, borderRadius: borderRadius.m, paddingHorizontal: spacing.m, fontSize: 16 },
  dateButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.m,
  },
  dateButtonText: { ...typography.body },
  clearDateText: { ...typography.caption, marginTop: spacing.xs, alignSelf: 'flex-end' },
  formHint: { ...typography.caption, marginTop: spacing.xs, lineHeight: 18 },
  defaultSwitchRow: {
    minHeight: 60,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.l,
    paddingTop: spacing.s,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  defaultSwitchLabel: { ...typography.body, flex: 1, marginRight: spacing.m },
  dateModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  dateModalContent: {
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
    paddingBottom: spacing.l,
  },
  dateDoneButton: { minHeight: 48, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: spacing.m },
  dateDoneText: { ...typography.body, fontWeight: '600' },
  iosDatePicker: { width: '100%' },
});
