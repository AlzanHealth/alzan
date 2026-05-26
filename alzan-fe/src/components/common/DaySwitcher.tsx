import React, { useRef, useMemo, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, useWindowDimensions } from 'react-native';
import { format, addDays, isSameDay, startOfWeek, startOfDay, addWeeks } from 'date-fns';
import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import { getDateFnsLocale } from '../../i18n/dateLocale';

interface DaySwitcherProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDates?: Set<string>;
}

export interface DaySwitcherRef {
  scrollToCurrentWeek: () => void;
  scrollToDate: (date: Date) => void;
}

export const DaySwitcher = forwardRef<DaySwitcherRef, DaySwitcherProps>(
  ({ selectedDate, onSelectDate, markedDates }, ref) => {
    const { styles: dynamicStyles, colors: themeColors } = useNutritionStyles();
    const { width: screenWidth } = useWindowDimensions();

    const MAX_CONTENT_WIDTH = 450;
    const PADDING_H = 16;

    // Configuration
    // We want a large range of weeks. Let's say +/- 50 weeks? Or infinite loading?
    // Use a fixed large range for now for simplicity, centered on "today" or "start".
    const WEEKS_BUFFER = 4; // 4 weeks before and after

    // Base Monday: start of current week
    const currentWeekStart = useMemo(() => startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 }), []);

    // Generate Array of "Week Start Dates"
    const weeks = useMemo(() => {
      // Generate range: [-WEEKS_BUFFER ... 0 ... +WEEKS_BUFFER]
      const arr: Date[] = [];
      for (let i = -WEEKS_BUFFER; i <= WEEKS_BUFFER; i++) {
        arr.push(addWeeks(currentWeekStart, i));
      }
      return arr;
    }, [currentWeekStart]);

    // Find index of the week containing selectedDate
    // This is for initial scroll OR when selectedDate changes (if we want to auto-scroll)
    // But usually we only auto-scroll on mount or "Today" press.
    const getIndexForDate = (date: Date) => {
      const weekStart = startOfWeek(startOfDay(date), { weekStartsOn: 1 });
      return weeks.findIndex(w => isSameDay(w, weekStart));
    };

    const initialIndex = useMemo(() => {
      const idx = getIndexForDate(new Date()); // Today
      return idx >= 0 ? idx : WEEKS_BUFFER; // Default to middle
    }, [weeks]);

    const flatListRef = useRef<FlatList>(null);
    const [visibleWeekIndex, setVisibleWeekIndex] = useState(initialIndex);

    const scrollToCurrentWeek = () => {
      const idx = getIndexForDate(new Date());
      if (idx >= 0 && flatListRef.current) {
        flatListRef.current.scrollToIndex({ index: idx, animated: true });
      }
    };

    const scrollToDate = (date: Date) => {
      const idx = getIndexForDate(date);
      if (idx >= 0 && flatListRef.current) {
        flatListRef.current.scrollToIndex({ index: idx, animated: true });
      }
    };

    useImperativeHandle(ref, () => ({
      scrollToCurrentWeek,
      scrollToDate,
    }));

    useEffect(() => {
      const targetIndex = getIndexForDate(selectedDate);
      if (targetIndex < 0 || targetIndex === visibleWeekIndex) return;
      flatListRef.current?.scrollToIndex({ index: targetIndex, animated: true });
    }, [selectedDate, visibleWeekIndex]);

    // NOTE: Initial scroll is handled by `initialScrollIndex` prop of FlatList usually,
    // but getItemLayout is required for it to work reliably.

    const renderDayItem = (date: Date) => {
      const isSelected = isSameDay(date, selectedDate);
      return (
        <TouchableOpacity
          key={date.toISOString()}
          style={[styles.dayItem, dynamicStyles.dayItem, isSelected && dynamicStyles.selectedDayItem]}
          onPress={() => onSelectDate(date)}
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
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 16,
    height: 72,
  },
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
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
  },
});
