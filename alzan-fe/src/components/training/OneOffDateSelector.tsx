import React, { useCallback, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, ChevronRight } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { formatLocalizedDate } from '../../i18n/dateLocale';
import { isValidIsoDate } from '../../modules/training/helpers/templateScheduling.helper';

interface OneOffDateSelectorProps {
  value: string | null;
  onChange: (date: string) => void;
  label: string;
  placeholder: string;
}

const dateToIso = (date: Date) => format(date, 'yyyy-MM-dd');

export const OneOffDateSelector = ({ value, onChange, label, placeholder }: OneOffDateSelectorProps) => {
  const { colors: themeColors, isDark } = useTrainingStyles();
  const [showNativePicker, setShowNativePicker] = useState(false);

  const selectedDate = isValidIsoDate(value) ? parseISO(value) : null;
  const pickerDate = selectedDate || new Date();

  const openWebPicker = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const input = document.createElement('input');
    input.type = 'date';
    input.value = value || dateToIso(new Date());
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';

    const cleanup = () => {
      input.removeEventListener('change', handleChange);
      input.removeEventListener('blur', cleanup);
      input.remove();
    };
    const handleChange = () => {
      if (input.value) onChange(input.value);
      cleanup();
    };

    input.addEventListener('change', handleChange);
    input.addEventListener('blur', cleanup);
    document.body.appendChild(input);
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch {
      // Safari can reject showPicker outside a trusted event; the regular click
      // still opens the native date control in that case.
      input.click();
    }
  }, [onChange, value]);

  const handlePress = () => {
    if (Platform.OS === 'web') {
      openWebPicker();
      return;
    }
    setShowNativePicker(true);
  };

  return (
    <>
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 52,
          borderBottomWidth: 1,
          borderBottomColor: themeColors.border,
        }}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Calendar size={16} color={themeColors.textSecondary} />
          <Text style={{ color: themeColors.textPrimary, marginLeft: 8, fontSize: 15 }}>{label}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: selectedDate ? themeColors.textPrimary : themeColors.textSecondary, fontSize: 15 }}>
            {selectedDate
              ? formatLocalizedDate(selectedDate, { en: 'MMM d, yyyy', es: "d 'de' MMM yyyy" })
              : placeholder}
          </Text>
          <ChevronRight size={16} color={themeColors.textSecondary} style={{ marginLeft: 4 }} />
        </View>
      </TouchableOpacity>

      {showNativePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          themeVariant={isDark ? 'dark' : 'light'}
          onChange={(_event, nextDate) => {
            setShowNativePicker(false);
            if (nextDate) onChange(dateToIso(nextDate));
          }}
        />
      )}
    </>
  );
};
