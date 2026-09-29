import React, { useRef, useMemo, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, useWindowDimensions } from 'react-native';
import { format, addDays, isSameDay, startOfDay, startOfWeek } from 'date-fns';
import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { getNutritionCalendarRange } from '../../modules/nutrition/services/nutritionCalendarRange';
import { CalendarDatePickerModal } from './CalendarDatePickerModal';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface DaySwitcherProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDates?: Set<string>;
  overTargetDates?: Set<string>;
  onPressDate?: (date: Date) => void;
}

export interface DaySwitcherRef {
  scrollToCurrentWeek: () => void;
  scrollToDate: (date: Date) => void;
}

export const DaySwitcher = forwardRef<DaySwitcherRef, DaySwitcherProps>(
  ({ selectedDate, onSelectDate, markedDates, overTargetDates, onPressDate }, ref) => {
    const { t } = useTranslation();
    const [calendarVisible, setCalendarVisible] = useState(false);
    const { styles: dynamicStyles, colors: themeColors } = useNutritionStyles();
    const { width: screenWidth } = useWindowDimensions();

    const MAX_CONTENT_WIDTH = 450;
    const PADDING_H = screenWidth < 340 ? 6 : 16;

    const { weeks, currentWeekIndex, minimumDate, maximumDate } = useMemo(() => getNutritionCalendarRange(), []);

    // Find index of the week containing selectedDate
    // This is for initial scroll OR when selectedDate changes (if we want to auto-scroll)
    // But usually we only auto-scroll on mount or "Today" press.
    const getIndexForDate = (date: Date) => {
      const weekStart = startOfWeek(startOfDay(date), { weekStartsOn: 1 });
      return weeks.findIndex(w => isSameDay(w, weekStart));
    };

    const initialIndex = useMemo(() => {
      const idx = getIndexForDate(selectedDate);
      return idx >= 0 ? idx : currentWeekIndex; // Default to middle
    }, [currentWeekIndex, weeks]);

    const flatListRef = useRef<FlatList>(null);
    const [visibleWeekIndex, setVisibleWeekIndex] = useState(initialIndex);

    const scrollToCurrentWeek = () => {
      const idx = getIndexForDate(new Date());
      if (idx >= 0 && flatListRef.current) {
        setVisibleWeekIndex(idx);
        flatListRef.current.scrollToIndex({ index: idx, animated: true });
      }
    };

    const scrollToDate = (date: Date) => {
      const idx = getIndexForDate(date);
      if (idx >= 0 && flatListRef.current) {
        setVisibleWeekIndex(idx);
        flatListRef.current.scrollToIndex({ index: idx, animated: true });
      }
    };

    useImperativeHandle(ref, () => ({
      scrollToCurrentWeek,
      scrollToDate,
    }));

    useEffect(() => {
      const targetIndex = getIndexForDate(selectedDate);
      if (targetIndex < 0) return;
      setVisibleWeekIndex(targetIndex);
      flatListRef.current?.scrollToIndex({ index: targetIndex, animated: true });
    }, [selectedDate]);

    // NOTE: Initial scroll is handled by `initialScrollIndex` prop of FlatList usually,
    // but getItemLayout is required for it to work reliably.

    const renderDayItem = (date: Date) => {
      const isSelected = isSameDay(date, selectedDate);
      const isOverTarget = overTargetDates?.has(format(date, 'yyyy-MM-dd'));
      return (
        <TouchableOpacity
          key={date.toISOString()}
          style={[
            styles.dayItem,
            dynamicStyles.dayItem,
            isSelected && dynamicStyles.selectedDayItem,
            isOverTarget && styles.overTargetDayItem,
          ]}
          onPress={() => (onPressDate ? onPressDate(date) : onSelectDate(date))}
          accessibilityRole="button"
          accessibilityLabel={format(date, 'PPPP', { locale: getDateFnsLocale() })}
          accessibilityState={{ selected: isSelected }}
        >
          <Text style={[styles.dayName, dynamicStyles.dayName, isSelected && { color: '#FFFFFF', fontWeight: '700' }]}>
            {format(date, 'EEE', { locale: getDateFnsLocale() }).toUpperCase().slice(0, 3)}
          </Text>
          <View style={[styles.dayNumberContainer, isSelected && { backgroundColor: themeColors.primary }]}>
            <Text style={[styles.dayNumber, dynamicStyles.dayNumber, isSelected && { color: '#FFFFFF' }]}>
              {format(date, 'd')}
            </Text>
          </View>
          {markedDates?.has(format(date, 'yyyy-MM-dd')) && (
            <View style={[styles.dot, { backgroundColor: isSelected ? '#FFFFFF' : themeColors.primary }]} />
          )}
          {isOverTarget && <View style={[styles.dot, { backgroundColor: isSelected ? '#FFFFFF' : '#D97706' }]} />}
        </TouchableOpacity>
      );
    };

    const renderWeekItem = ({ item: startOfWeekDate }: { item: Date }) => {
      // Generate 7 days for this week
      const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeekDate, i));

      return (
        <View style={{ width: screenWidth, alignItems: 'center' }}>
          <View style={[styles.weekRow, { width: Math.min(screenWidth - PADDING_H * 2, MAX_CONTENT_WIDTH) }]}>
            {days.map(renderDayItem)}
          </View>
        </View>
      );
    };

    return (
      <View style={styles.container}>
        <View style={styles.periodRow}>
          <TouchableOpacity
            style={styles.periodAction}
            accessibilityRole="button"
            accessibilityLabel={t('training.previousWeek')}
            disabled={visibleWeekIndex === 0}
            onPress={() => scrollToDate(weeks[visibleWeekIndex - 1])}
          >
            <ChevronLeft size={20} color={visibleWeekIndex === 0 ? themeColors.textSecondary : themeColors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.periodTitle}
            accessibilityRole="button"
            onPress={() => setCalendarVisible(true)}
          >
            <Text style={{ color: themeColors.textPrimary, textAlign: 'center', fontWeight: '600' }}>
              {format(weeks[visibleWeekIndex], 'd MMM', { locale: getDateFnsLocale() })} –{' '}
              {format(addDays(weeks[visibleWeekIndex], 6), 'd MMM yyyy', { locale: getDateFnsLocale() })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.periodAction}
            accessibilityRole="button"
            accessibilityLabel={t('training.nextWeek')}
            disabled={visibleWeekIndex === weeks.length - 1}
            onPress={() => scrollToDate(weeks[visibleWeekIndex + 1])}
          >
            <ChevronRight
              size={20}
              color={visibleWeekIndex === weeks.length - 1 ? themeColors.textSecondary : themeColors.primary}
            />
          </TouchableOpacity>
          {(!isSameDay(selectedDate, new Date()) || visibleWeekIndex !== currentWeekIndex) && (
            <TouchableOpacity
              style={styles.periodAction}
              accessibilityRole="button"
              onPress={() => {
                onSelectDate(startOfDay(new Date()));
                scrollToCurrentWeek();
              }}
            >
              <Text style={{ color: themeColors.primary }}>{t('health.today')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          ref={flatListRef}
          data={weeks}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.toISOString()}
          renderItem={renderWeekItem}
          getItemLayout={(data, index) => ({
            length: screenWidth,
            offset: screenWidth * index,
            index,
          })}
          initialScrollIndex={initialIndex}
          onScrollToIndexFailed={info => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
            }, 500);
          }}
          onMomentumScrollEnd={event => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
            if (nextIndex >= 0 && nextIndex < weeks.length) {
              setVisibleWeekIndex(nextIndex);
            }
          }}
          // Remove extra padding in content container since we handle it in item
          contentContainerStyle={{ paddingHorizontal: 0 }}
        />
        <CalendarDatePickerModal
          visible={calendarVisible}
          value={selectedDate}
          title={t('training.selectDate')}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onCancel={() => setCalendarVisible(false)}
          onConfirm={date => {
            onSelectDate(date);
            scrollToDate(date);
            setCalendarVisible(false);
          }}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 16,
    minHeight: 116,
  },
  periodRow: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 450, alignSelf: 'center' },
  periodAction: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  periodTitle: { flex: 1, minHeight: 44, justifyContent: 'center' },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  dayItem: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 6,
    borderRadius: 16,
    width: 44, // Fixed width
    // margin removed, we use space-between
  },
  dayName: {
    fontSize: 10,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  dayNumberContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  overTargetDayItem: {
    borderWidth: 2,
    borderColor: '#D97706',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
  },
});
