import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { spacing } from '../../theme';

interface WeekDaySelectorProps {
  selectedDays: number[]; // 0 = Sunday, 1 = Monday, etc.
  onDaysChange: (days: number[]) => void;
  isRecurring?: boolean;
  onToggleRecurring?: () => void;
  recurringLabel?: string;
  readOnly?: boolean;
  singleSelect?: boolean;
}

export const WeekDaySelector = ({
  selectedDays,
  onDaysChange,
  isRecurring = false,
  onToggleRecurring,
  recurringLabel = 'Repetir todas las semanas',
  readOnly = false,
  singleSelect = false,
}: WeekDaySelectorProps) => {
  const { colors: themeColors, isDark } = useTrainingStyles();
  const { width } = useWindowDimensions();

  const { chipSize, chipFontSize, rowGap } = useMemo(() => {
    const horizontalPadding = Platform.OS === 'web' ? 140 : 44;
    const usableWidth = Math.max(width - horizontalPadding, 260);
    const computed = Math.floor((usableWidth - 6 * 8) / 7);
    const normalizedSize = Math.min(56, Math.max(34, computed));

    return {
      chipSize: normalizedSize,
      chipFontSize: normalizedSize >= 46 ? 18 : normalizedSize >= 40 ? 16 : 14,
      rowGap: normalizedSize >= 46 ? 10 : 8,
    };
  }, [width]);

  const days = [
    { label: 'L', value: 1 },
    { label: 'M', value: 2 },
    { label: 'X', value: 3 },
    { label: 'J', value: 4 },
    { label: 'V', value: 5 },
    { label: 'S', value: 6 },
    { label: 'D', value: 0 },
  ];

  const handleDayPress = (dayValue: number) => {
    if (readOnly) return;

    if (selectedDays.includes(dayValue)) {
      // Remove day
      onDaysChange(selectedDays.filter(d => d !== dayValue));
    } else {
      // Add day
      if (singleSelect) {
        // If single select, replace logic
        onDaysChange([dayValue]);
      } else {
        // Multi select, append logic
        onDaysChange([...selectedDays, dayValue]);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.daysRow, { gap: rowGap }]}>
        {days.map(day => {
          const isSelected = selectedDays.includes(day.value);
          return (
            <TouchableOpacity
              key={day.value}
              style={[
                styles.dayChip,
                {
                  width: chipSize,
                  height: chipSize,
                  borderRadius: chipSize / 2,
                },
                isSelected && styles.activeDayChip,
                !isSelected && {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                  borderColor: themeColors.border,
                },
                isSelected && {
                  backgroundColor: themeColors.primary,
                  borderColor: themeColors.primary,
                },
              ]}
              onPress={() => handleDayPress(day.value)}
              disabled={readOnly}
            >
              <Text
                style={[
                  styles.dayChipText,
                  { fontSize: chipFontSize },
                  isSelected && styles.activeDayChipText,
                  !isSelected && { color: themeColors.textSecondary },
                ]}
              >
                {day.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {onToggleRecurring && (
        <TouchableOpacity style={styles.repeatToggleContainer} onPress={onToggleRecurring} disabled={readOnly}>
          <View
            style={[
              styles.checkbox,
              isRecurring && styles.checkboxActive,
              { borderColor: themeColors.primary },
              isRecurring && { backgroundColor: themeColors.primary },
            ]}
          >
            {isRecurring && <Check size={12} color="#FFF" strokeWidth={4} />}
          </View>
          <Text style={[styles.repeatToggleText, { color: themeColors.textPrimary }]}>{recurringLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.s,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  dayChip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  activeDayChip: {
    // Colors handled inline for dynamic support
  },
  dayChipText: {
    fontWeight: '600',
  },
  activeDayChipText: {
    color: '#FFFFFF',
  },
  repeatToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.m,
    paddingVertical: spacing.s,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    // Handled inline
  },
  repeatToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
