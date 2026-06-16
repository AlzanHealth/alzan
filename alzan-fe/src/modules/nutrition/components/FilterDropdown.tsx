import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { borderRadius } from '../../../theme';

interface FilterOption<T extends string> {
  key: T;
  label: string;
}

interface FilterDropdownProps<T extends string> {
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}

/** Compact dropdown: a pill showing the current option that opens a small menu. */
export function FilterDropdown<T extends string>({ value, options, onChange }: FilterDropdownProps<T>) {
  const { colors, isDark } = useNutritionStyles();
  const [open, setOpen] = useState(false);
  const current = options.find(option => option.key === value);

  return (
    <>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={[styles.buttonText, { color: colors.textPrimary }]} numberOfLines={1}>
          {current?.label}
        </Text>
        <ChevronDown size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={[styles.menu, { backgroundColor: isDark ? colors.surfaceSolid : '#FFF' }]}>
            {options.map(option => {
              const selected = option.key === value;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={styles.menuItem}
                  onPress={() => {
                    onChange(option.key);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.menuItemText, { color: selected ? colors.primary : colors.textPrimary }]}>
                    {option.label}
                  </Text>
                  {selected && <Check size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: borderRadius.m,
  },
  buttonText: { flex: 1, fontSize: 14, fontWeight: '600' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  menu: {
    borderRadius: 16,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  menuItemText: { fontSize: 15, fontWeight: '500' },
});
