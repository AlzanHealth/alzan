import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, MoreHorizontal, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../context/ThemeContext';
import { Alert } from '../../../components/common/Alert';
import { borderRadius, spacing } from '../../../theme';
import { TemplateListSort } from '../helpers/templateList.helper';

type TemplateListManagementMenuProps = {
  itemCount: number;
  sort: TemplateListSort;
  isDeleting: boolean;
  onSortChange: (sort: TemplateListSort) => void;
  onDeleteAll: () => void;
};

const SORT_OPTIONS: readonly TemplateListSort[] = ['name', 'created', 'usage'];

export const TemplateListManagementMenu = ({
  itemCount,
  sort,
  isDeleting,
  onSortChange,
  onDeleteAll,
}: TemplateListManagementMenuProps) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [visible, setVisible] = React.useState(false);

  const sortLabels: Record<TemplateListSort, string> = {
    name: t('training.sortTemplatesByName'),
    created: t('training.sortTemplatesByCreation'),
    usage: t('training.sortTemplatesByUsage'),
  };

  const handleDeleteAll = () => {
    if (itemCount === 0 || isDeleting) return;
    setVisible(false);
    Alert.alert(t('training.deleteAllTemplatesTitle'), t('training.deleteAllTemplatesMessage', { count: itemCount }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('training.deleteAllTemplatesAction'), style: 'destructive', onPress: onDeleteAll },
    ]);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        disabled={isDeleting}
        style={[styles.trigger, { borderColor: colors.border, backgroundColor: colors.surfaceSolid }]}
        accessibilityRole="button"
        accessibilityLabel={t('training.templateListOptions')}
        accessibilityState={{ disabled: isDeleting }}
      >
        <MoreHorizontal size={22} color={colors.textPrimary} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} />
          <View style={[styles.menu, { backgroundColor: colors.surfaceSolid }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{t('training.templateListOptions')}</Text>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('training.sortTemplates')}</Text>

            {SORT_OPTIONS.map(option => (
              <TouchableOpacity
                key={option}
                style={styles.option}
                onPress={() => {
                  onSortChange(option);
                  setVisible(false);
                }}
                accessibilityRole="radio"
                accessibilityLabel={sortLabels[option]}
                accessibilityState={{ selected: sort === option }}
              >
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>{sortLabels[option]}</Text>
                {sort === option && <Check size={20} color={colors.primary} />}
              </TouchableOpacity>
            ))}

            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={[styles.option, styles.deleteOption]}
              onPress={handleDeleteAll}
              disabled={itemCount === 0 || isDeleting}
              accessibilityRole="button"
              accessibilityLabel={t('training.deleteAllTemplatesAction')}
              accessibilityState={{ disabled: itemCount === 0 || isDeleting }}
            >
              <Trash2 size={20} color={itemCount === 0 ? colors.textSecondary : colors.danger} />
              <Text
                style={[
                  styles.optionText,
                  { color: itemCount === 0 ? colors.textSecondary : colors.danger, fontWeight: '700' },
                ]}
              >
                {t('training.deleteAllTemplatesAction')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => setVisible(false)}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  menu: {
    width: 280,
    marginTop: 78,
    marginRight: spacing.l,
    borderRadius: borderRadius.l,
    padding: spacing.s,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 8,
  },
  title: { fontSize: 18, fontWeight: '800', paddingHorizontal: spacing.s, paddingTop: spacing.s },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', padding: spacing.s, marginTop: 4 },
  option: {
    minHeight: 48,
    borderRadius: borderRadius.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s,
    gap: spacing.s,
  },
  optionText: { flex: 1, fontSize: 15, fontWeight: '600' },
  separator: { height: 1, marginVertical: spacing.s },
  deleteOption: { justifyContent: 'flex-start' },
  cancelButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.s,
  },
  cancelText: { fontSize: 15, fontWeight: '700' },
});
