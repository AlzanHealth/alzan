import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { borderRadius, spacing } from '../../../theme';

type TemplateSelectionCheckboxProps = {
  accessibilityLabel: string;
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
  primaryColor: string;
  borderColor: string;
};

export const TemplateSelectionCheckbox = ({
  accessibilityLabel,
  checked,
  disabled,
  onPress,
  primaryColor,
  borderColor,
}: TemplateSelectionCheckboxProps) => (
  <View style={styles.wrapper}>
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.target, { opacity: disabled ? 0.5 : 1 }]}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
    >
      <View
        style={[
          styles.checkbox,
          {
            backgroundColor: checked ? primaryColor : 'transparent',
            borderColor: checked ? primaryColor : borderColor,
          },
        ]}
      >
        {checked && <Check size={16} color="#FFFFFF" strokeWidth={3} />}
      </View>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  wrapper: { marginRight: spacing.s },
  target: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
