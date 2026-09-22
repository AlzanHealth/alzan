import React, { useEffect, useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowDown, ArrowUp, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useHomeCards } from '../../hooks/settings/useHomeCards';
import { HOME_CARDS_COUNT, HOME_CARD_DEFINITIONS, HomeCardKey } from '../../constants/homeCards';
import { useTabBarLayout } from '../../navigation/tabBarLayout';

export const HomeCardsSettingsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const { homeCards, setHomeCards, updating } = useHomeCards();
  const { topFromScreenBottom } = useTabBarLayout();

  const [selected, setSelected] = useState<HomeCardKey[]>(homeCards);

  // Keep local state in sync once preferences finish loading.
  useEffect(() => {
    setSelected(homeCards);
  }, [homeCards]);

  const cardBg = isDark ? colors.surfaceSolid : colors.white;

  const toggle = (key: HomeCardKey) => {
    setSelected(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      }
      if (prev.length >= HOME_CARDS_COUNT) {
        return prev;
      }
      return [...prev, key];
    });
  };

  const moveSelected = (index: number, direction: -1 | 1) => {
    setSelected(prev => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const canSave = selected.length === HOME_CARDS_COUNT && !updating;

  const handleSave = async () => {
    if (!canSave) return;
    const didSave = await setHomeCards(selected);
    if (didSave) {
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: topFromScreenBottom + 96 }]}>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {t('settings.homeCardsDescription', { count: HOME_CARDS_COUNT })}
        </Text>
        <Text style={[styles.counter, { color: canSave ? colors.primary : colors.textSecondary }]}>
          {t('settings.homeCardsSelected', { selected: selected.length, total: HOME_CARDS_COUNT })}
        </Text>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('settings.homeCardsOrderTitle')}</Text>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {selected.map((key, index) => {
            const def = HOME_CARD_DEFINITIONS.find(item => item.key === key);
            if (!def) return null;
            const Icon = def.icon;
            const isLast = index === selected.length - 1;
            return (
              <React.Fragment key={key}>
                <View style={styles.orderRow}>
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.background },
                    ]}
                  >
                    <Icon size={18} color={colors.primary} />
                  </View>
                  <View style={styles.orderText}>
                    <Text style={[styles.label, { color: colors.textPrimary }]}>{t(def.labelKey)}</Text>
                    <Text style={[styles.orderMeta, { color: colors.textSecondary }]}>
                      {t('settings.homeCardsOrderPosition', { position: index + 1 })}
                    </Text>
                  </View>
                  <View style={styles.orderButtons}>
                    <TouchableOpacity
                      style={[
                        styles.orderButton,
                        { borderColor: colors.border },
                        index === 0 && styles.disabledControl,
                      ]}
                      onPress={() => moveSelected(index, -1)}
                      disabled={index === 0}
                      accessibilityLabel={t('training.moveUp')}
                    >
                      <ArrowUp size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.orderButton, { borderColor: colors.border }, isLast && styles.disabledControl]}
                      onPress={() => moveSelected(index, 1)}
                      disabled={isLast}
                      accessibilityLabel={t('training.moveDown')}
                    >
                      <ArrowDown size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
                {!isLast && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              </React.Fragment>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t('settings.homeCardsAvailableTitle')}
        </Text>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {HOME_CARD_DEFINITIONS.map((def, index) => {
            const Icon = def.icon;
            const isOn = selected.includes(def.key);
            const isLast = index === HOME_CARD_DEFINITIONS.length - 1;
            return (
              <React.Fragment key={def.key}>
                <TouchableOpacity style={styles.row} onPress={() => toggle(def.key)} activeOpacity={0.7}>
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.background },
                    ]}
                  >
                    <Icon size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.label, { color: colors.textPrimary }]}>{t(def.labelKey)}</Text>
                  <View
                    style={[
                      styles.checkbox,
                      isOn
                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                        : { borderColor: colors.border },
                    ]}
                  >
                    {isOn && <Check size={16} color="#FFFFFF" />}
                  </View>
                </TouchableOpacity>
                {!isLast && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              </React.Fragment>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            bottom: topFromScreenBottom + spacing.s,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }, !canSave && { opacity: 0.4 }]}
          onPress={handleSave}
          disabled={!canSave}
        >
          {updating ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveText}>{t('common.save')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    ...formLayout.settings,
    padding: spacing.m,
  },
  description: {
    ...typography.body,
    marginBottom: spacing.s,
  },
  counter: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.m,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.m,
    overflow: 'hidden',
    marginBottom: spacing.l,
    ...shadows.soft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.s,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.m,
  },
  label: {
    ...typography.body,
    flex: 1,
  },
  orderRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
  },
  orderText: {
    flex: 1,
    paddingRight: spacing.s,
  },
  orderMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  orderButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  orderButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.s,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledControl: {
    opacity: 0.35,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    padding: spacing.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    paddingVertical: spacing.m,
    borderRadius: borderRadius.m,
    alignItems: 'center',
  },
  saveText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
