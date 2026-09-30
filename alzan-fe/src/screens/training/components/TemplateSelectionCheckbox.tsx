import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { borderRadius, spacing } from '../../../theme';

type TemplateSelectionCheckboxProps = {
  checked: boolean;
  primaryColor: string;
  borderColor: string;
};

export const TemplateSelectionCheckbox = ({ checked, primaryColor, borderColor }: TemplateSelectionCheckboxProps) => (
  <View style={styles.wrapper}>
    <View accessible={false} style={styles.target}>
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
    </View>
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
