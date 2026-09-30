import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../context/ThemeContext';
import { borderRadius, spacing } from '../../../theme';

type Props = { selectedCount: number; isDeleting: boolean; onCancel: () => void; onDelete: () => void };

export const TemplateSelectionToolbar = ({ selectedCount, isDeleting, onCancel, onDelete }: Props) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const disabled = selectedCount === 0 || isDeleting;

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}>
      <Text style={[styles.count, { color: colors.textPrimary }]}>
        {t('training.selectedTemplatesCount', { count: selectedCount })}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, { borderColor: colors.border }]}
          onPress={onCancel}
          disabled={isDeleting}
          accessibilityRole="button"
        >
          <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.deleteButton, { backgroundColor: disabled ? colors.border : colors.danger }]}
          onPress={onDelete}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
        >
          <Trash2 size={16} color="#FFFFFF" />
          <Text style={styles.deleteText}>{t('training.deleteSelectedTemplatesAction', { count: selectedCount })}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, paddingHorizontal: spacing.l, paddingVertical: spacing.s, gap: spacing.s },
  count: { fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.s },
  button: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.s,
  },
  deleteButton: { borderWidth: 0 },
  deleteText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
