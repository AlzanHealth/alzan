import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CalendarRange, CheckSquare, Copy, MoveRight, Utensils, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';

export type MealBatchAction = 'import-menu' | 'select' | 'duplicate-day' | 'copy-range' | 'move-range';

type MealBatchActionsMenuProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: MealBatchAction) => void;
};

export const MealBatchActionsMenu = ({ visible, onClose, onSelect }: MealBatchActionsMenuProps) => {
  const { t } = useTranslation();
  const { colors } = useNutritionStyles();

  const actions: Array<{ action: MealBatchAction; icon: React.ReactNode; label: string; description: string }> = [
    {
      action: 'import-menu',
      icon: <Utensils size={22} color={colors.primary} />,
      label: t('nutrition.menuImportOpenAccessibility'),
      description: t('nutrition.menuImportOpenDescription'),
    },
    {
      action: 'select',
      icon: <CheckSquare size={22} color={colors.primary} />,
      label: t('nutrition.selectMeals'),
      description: t('nutrition.selectMealsDescription'),
    },
    {
      action: 'duplicate-day',
      icon: <Copy size={22} color={colors.primary} />,
      label: t('nutrition.duplicateDay'),
      description: t('nutrition.duplicateDayDescription'),
    },
    {
      action: 'copy-range',
      icon: <CalendarRange size={22} color={colors.primary} />,
      label: t('nutrition.copyRange'),
      description: t('nutrition.copyRangeDescription'),
    },
    {
      action: 'move-range',
      icon: <MoveRight size={22} color={colors.primary} />,
      label: t('nutrition.moveRange'),
      description: t('nutrition.moveRangeDescription'),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.cancel')} />
        <View style={[styles.content, { backgroundColor: colors.surfaceSolid }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{t('nutrition.nutritionActions')}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {actions.map(item => (
            <Pressable
              key={item.action}
              onPress={() => {
                onClose();
                onSelect(item.action);
              }}
              style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.primary + '12' }]}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}. ${item.description}`}
            >
              <View style={[styles.icon, { backgroundColor: colors.primary + '12' }]}>{item.icon}</View>
              <View style={styles.copy}>
                <Text style={[styles.label, { color: colors.textPrimary }]}>{item.label}</Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>{item.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    paddingBottom: 24,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '800' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  action: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 8, gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  label: { fontSize: 16, fontWeight: '700' },
  description: { fontSize: 13, marginTop: 3 },
});
