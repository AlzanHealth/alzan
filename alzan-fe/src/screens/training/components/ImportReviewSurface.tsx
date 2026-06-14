import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, Bell, ChevronRight, Watch, X } from 'lucide-react-native';
import { GlassCard } from '../../../components/GlassCard';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { borderRadius, spacing, typography } from '../../../theme';
import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { supabase } from '../../../lib/supabaseClient';
import { getDateFnsLocale } from '../../../i18n/dateLocale';
import { formatDuration, getSportDefaultTitleKey, SPORTS_CONFIG } from '../../../constants/sports';
import { ImportReviewItem, ImportReviewReason, useImportReviewQueue } from '../../../hooks/useImportReviewQueue';
import { ActivitySession } from '../../../types/requests.types';
import { TranslationKey } from '../../../i18n/locales/en';

interface ImportReviewSurfaceProps {
  /** Opens the full editable detail/summary for the activity. */
  onOpenSession: (session: ActivitySession) => void;
}

const REASON_TITLE_KEY: Record<ImportReviewReason, TranslationKey> = {
  new_import: 'training.importReviewNewActivityTitle',
  duplicate: 'training.importReviewDuplicateTitle',
  watch_conflict: 'training.importReviewWatchConflictTitle',
  strength_assignment: 'training.importReviewStrengthAssignTitle',
};

/**
 * Surfaces the import-review queue on the Training home: a persistent banner
 * for the top-priority item (hard conflicts first, else the latest new import)
 * plus a one-time bottom-sheet that auto-opens for the latest unreviewed
 * imported activity (Strava-like "new activity" summary).
 */
export const ImportReviewSurface: React.FC<ImportReviewSurfaceProps> = ({ onOpenSession }) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useTrainingStyles();
  const queryClient = useQueryClient();
  const { items, latestNewImport, topItem, markSeen } = useImportReviewQueue();

  const [sheetSession, setSheetSession] = useState<ActivitySession | null>(null);
  const [nameValue, setNameValue] = useState('');
  const autoShownIdRef = useRef<string | null>(null);

  // Auto-open the sheet once for the latest unreviewed import.
  useEffect(() => {
    if (!latestNewImport) return;
    if (autoShownIdRef.current === latestNewImport.session.id) return;
    autoShownIdRef.current = latestNewImport.session.id;
    setSheetSession(latestNewImport.session);
    setNameValue(latestNewImport.session.name ?? '');
  }, [latestNewImport]);

  const closeSheet = (session: ActivitySession) => {
    setSheetSession(null);
    markSeen.mutate(session.id);
  };

  const openDetail = (session: ActivitySession) => {
    setSheetSession(null);
    markSeen.mutate(session.id);
    onOpenSession(session);
  };

  const handleBannerPress = (item: ImportReviewItem) => {
    if (item.hard) {
      onOpenSession(item.session);
    } else {
      // Soft new-import: reopen the lightweight summary sheet.
      setSheetSession(item.session);
      setNameValue(item.session.name ?? '');
    }
  };

  const saveName = async (session: ActivitySession) => {
    const trimmed = nameValue.trim();
    const { error } = await supabase
      .from('activity_sessions')
      .update({ name: trimmed || null })
      .eq('id', session.id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['activitySession', session.id] });
      setSheetSession(current => (current ? { ...current, name: trimmed || null } : current));
    }
  };

  const extraCount = Math.max(0, items.length - 1);

  return (
    <>
      {topItem && (
        <TouchableOpacity activeOpacity={0.85} onPress={() => handleBannerPress(topItem)}>
          <GlassCard style={[styles.banner, topItem.hard && { borderColor: themeColors.warning, borderWidth: 1 }]}>
            <View style={styles.bannerIcon}>
              {topItem.reason === 'watch_conflict' ? (
                <Watch size={22} color={themeColors.warning} />
              ) : topItem.hard ? (
                <AlertTriangle size={22} color={themeColors.warning} />
              ) : (
                <Bell size={22} color={themeColors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.body, { color: themeColors.textPrimary, fontWeight: '600' }]}>
                {t(REASON_TITLE_KEY[topItem.reason])}
              </Text>
              <Text style={[typography.caption, { color: themeColors.textSecondary }]} numberOfLines={1}>
                {topItem.session.name ||
                  t(getSportDefaultTitleKey(topItem.session.sport_type, topItem.session.sport_subtype))}
                {extraCount > 0 ? ` · ${t('training.importReviewPendingCount', { count: extraCount })}` : ''}
              </Text>
            </View>
            <ChevronRight size={20} color={themeColors.textSecondary} />
          </GlassCard>
        </TouchableOpacity>
      )}

      <Modal
        visible={sheetSession != null}
        transparent
        animationType="slide"
        onRequestClose={() => sheetSession && closeSheet(sheetSession)}
      >
        <View style={styles.sheetRoot}>
          <BlurView intensity={30} style={StyleSheet.absoluteFill} tint={isDark ? 'dark' : 'light'} />
          <TouchableWithoutFeedback onPress={() => sheetSession && closeSheet(sheetSession)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {sheetSession && (
              <SheetCard
                session={sheetSession}
                nameValue={nameValue}
                onChangeName={setNameValue}
                onSaveName={() => saveName(sheetSession)}
                onView={() => openDetail(sheetSession)}
                onClose={() => closeSheet(sheetSession)}
              />
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
};

interface SheetCardProps {
  session: ActivitySession;
  nameValue: string;
  onChangeName: (value: string) => void;
  onSaveName: () => void;
  onView: () => void;
  onClose: () => void;
}

const SheetCard: React.FC<SheetCardProps> = ({ session, nameValue, onChangeName, onSaveName, onView, onClose }) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useTrainingStyles();
  const { convertDistanceToUi } = useUnitConversion();
  const config = SPORTS_CONFIG[session.sport_type] || SPORTS_CONFIG.other;

  const distance =
    session.distance_m != null && session.distance_m > 0 ? convertDistanceToUi(session.distance_m, 2) : null;

  return (
    <View style={[styles.sheetCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetHeader}>
        <Text style={[typography.caption, { color: themeColors.textSecondary }]}>
          {t('training.importReviewSheetTitle')}
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <X size={20} color={themeColors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.sheetNameRow}>
        <TextInput
          style={[styles.sheetNameInput, { color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={nameValue}
          onChangeText={onChangeName}
          onBlur={onSaveName}
          placeholder={t(getSportDefaultTitleKey(session.sport_type, session.sport_subtype))}
          placeholderTextColor={themeColors.textSecondary}
        />
      </View>

      <Text style={[typography.caption, { color: themeColors.textSecondary, marginBottom: spacing.s }]}>
        {t(config.label)} · {format(new Date(session.start_time), 'd MMM, HH:mm', { locale: getDateFnsLocale() })}
      </Text>

      <View style={styles.sheetStats}>
        {session.duration_s != null && session.duration_s > 0 && (
          <View style={styles.sheetStat}>
            <Text style={[typography.h3, { color: themeColors.textPrimary }]}>
              {formatDuration(session.duration_s)}
            </Text>
            <Text style={[typography.caption, { color: themeColors.textSecondary }]}>{t('training.time')}</Text>
          </View>
        )}
        {distance && (
          <View style={styles.sheetStat}>
            <Text style={[typography.h3, { color: themeColors.textPrimary }]}>
              {distance.value} {distance.unit}
            </Text>
            <Text style={[typography.caption, { color: themeColors.textSecondary }]}>{t('training.distance')}</Text>
          </View>
        )}
        {session.calories_kcal != null && session.calories_kcal > 0 && (
          <View style={styles.sheetStat}>
            <Text style={[typography.h3, { color: themeColors.textPrimary }]}>{session.calories_kcal}</Text>
            <Text style={[typography.caption, { color: themeColors.textSecondary }]}>{t('nutrition.kcal')}</Text>
          </View>
        )}
      </View>

      <PrimaryButton title={t('training.importReviewViewActivity')} onPress={onView} style={{ marginTop: spacing.m }} />
      <PrimaryButton
        title={t('training.importReviewClose')}
        onPress={onClose}
        variant="outline"
        style={{ marginTop: spacing.s }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
    padding: spacing.l,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.4)',
    alignSelf: 'center',
    marginBottom: spacing.m,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s,
  },
  sheetNameRow: {
    marginBottom: spacing.s,
  },
  sheetNameInput: {
    fontSize: 20,
    fontWeight: '700',
    borderBottomWidth: 1,
    paddingVertical: spacing.xs,
  },
  sheetStats: {
    flexDirection: 'row',
    gap: spacing.l,
    marginTop: spacing.s,
  },
  sheetStat: {
    alignItems: 'flex-start',
  },
});

export default ImportReviewSurface;
