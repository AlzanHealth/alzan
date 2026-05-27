import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from 'react-native';
import { spacing, typography } from '../../../theme';
import { useTheme } from '../../../context/ThemeContext';
import { LiquidBackground } from '../../../components/LiquidBackground';
import { Repeat, X, MoreHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface RepetitionsSelectorModalProps {
  visible: boolean;
  currentValue: number;
  onSelect: (value: number) => void;
  onClose: () => void;
}

const REPETITION_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12];
const ITEM_HEIGHT = 44;
const WHEEL_VISIBLE_ITEMS = 5;

export const RepetitionsSelectorModal = ({
  visible,
  currentValue,
  onSelect,
  onClose,
}: RepetitionsSelectorModalProps) => {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const [mode, setMode] = useState<'grid' | 'wheel'>('grid');
  const [wheelValue, setWheelValue] = useState(currentValue);

  useEffect(() => {
    if (visible) {
      setMode('grid');
      setWheelValue(currentValue);
    }
  }, [visible, currentValue]);

  const dynamicStyles = {
    headerIcon: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F2F2F7',
    },
    closeBtn: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F2F2F7',
    },
    optionBtn: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    },
    optionText: {
      color: colors.textPrimary,
    },
    wheelText: {
      color: colors.textSecondary,
    },
    wheelTextSelected: {
      color: colors.textPrimary,
    },
    selectionOverlay: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    },
    confirmBtn: {
      backgroundColor: colors.primary,
    },
    title: {
      color: colors.textPrimary,
    },
  };

  // Wheel Logic
  const scrollViewRef = useRef<ScrollView>(null);
  const lastEmittedIndexRef = useRef(-1);
  const currentOffsetYRef = useRef(0);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWeb = Platform.OS === 'web';
  const range = Array.from({ length: 99 }, (_, i) => i + 1); // 1 to 99

  const getOffsetY = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetFromContent = event.nativeEvent.contentOffset?.y;
    if (typeof offsetFromContent === 'number') return offsetFromContent;

    const nativeEvent = event.nativeEvent as unknown;
    if (typeof nativeEvent !== 'object' || nativeEvent === null) return 0;

    const target = (nativeEvent as { target?: unknown }).target;
    if (typeof target !== 'object' || target === null) return 0;

    const scrollTop = (target as { scrollTop?: unknown }).scrollTop;
    return typeof scrollTop === 'number' ? scrollTop : 0;
  };

  const emitValueFromOffset = (offsetY: number) => {
    const index = Math.round(offsetY / ITEM_HEIGHT);
    const value = range[index];
    if (!value || lastEmittedIndexRef.current === index) return;
    lastEmittedIndexRef.current = index;
    if (value !== wheelValue) {
      setWheelValue(value);
    }
  };

  const snapToIndex = (index: number, animated: boolean) => {
    if (index < 0 || index >= range.length) return;
    scrollViewRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated });
  };

  const settleToNearest = (offsetY: number) => {
    const index = Math.round(offsetY / ITEM_HEIGHT);
    if (index < 0 || index >= range.length) return;
    emitValueFromOffset(offsetY);
    snapToIndex(index, false);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = getOffsetY(event);
    currentOffsetYRef.current = offsetY;
    emitValueFromOffset(offsetY);

    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
    }

    settleTimeoutRef.current = setTimeout(() => {
      settleToNearest(currentOffsetYRef.current);
    }, 80);
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = getOffsetY(event);
    currentOffsetYRef.current = offsetY;
    settleToNearest(offsetY);
  };

  const handleWheelConfirm = () => {
    onSelect(wheelValue);
    onClose();
  };

  // Scroll to initial value when entering wheel mode
  useEffect(() => {
    if (mode === 'wheel' && scrollViewRef.current) {
      // Wait for layout
      setTimeout(() => {
        const index = range.indexOf(wheelValue);
        if (index !== -1) {
          lastEmittedIndexRef.current = index;
          scrollViewRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
        }
      }, 100);
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()}>
          <LiquidBackground style={styles.modalContainer} borderRadius={30} intensity={isDark ? 50 : 30}>
            {/* Header */}
            <View style={styles.header}>
              {mode === 'wheel' ? (
                <TouchableOpacity
                  onPress={() => setMode('grid')}
                  style={styles.backBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back')}
                >
                  <Text style={[styles.backText, { color: colors.primary }]}>{t('common.back')}</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.headerIcon, dynamicStyles.headerIcon]}>
                  <Repeat size={16} color={colors.textPrimary} />
                </View>
              )}

              <Text style={[styles.title, dynamicStyles.title]}>
                {mode === 'wheel' ? t('training.selectNumber') : t('training.repetitions')}
              </Text>

              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeBtn, dynamicStyles.closeBtn]}
                accessibilityRole="button"
                accessibilityLabel={t('training.close')}
              >
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {mode === 'grid' ? (
              <View style={styles.optionsGrid}>
                {REPETITION_OPTIONS.map(value => {
                  const isSelected = value === currentValue;
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.optionBtn,
                        dynamicStyles.optionBtn,
                        isSelected && styles.optionBtnSelected,
                        isSelected && {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => {
                        onSelect(value);
                        onClose();
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text
                        style={[styles.optionText, dynamicStyles.optionText, isSelected && styles.optionTextSelected]}
                      >
                        {value}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Custom "..." Button */}
                <TouchableOpacity
                  style={[styles.optionBtn, dynamicStyles.optionBtn]}
                  onPress={() => setMode('wheel')}
                  accessibilityRole="button"
                  accessibilityLabel={t('training.selectNumber')}
                >
                  <MoreHorizontal size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            ) : (
              /* Wheel Picker View */
              <View style={styles.wheelContainer}>
                <View style={[styles.selectionOverlay, dynamicStyles.selectionOverlay]} pointerEvents="none" />
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.scroller}
                  contentContainerStyle={{
                    paddingVertical: (WHEEL_VISIBLE_ITEMS * ITEM_HEIGHT) / 2 - ITEM_HEIGHT / 2,
                  }}
                  snapToInterval={ITEM_HEIGHT}
                  snapToAlignment="start"
                  disableIntervalMomentum
                  decelerationRate="fast"
                  showsVerticalScrollIndicator={false}
                  onScroll={handleScroll}
                  onMomentumScrollEnd={handleScrollEnd}
                  onScrollEndDrag={isWeb ? handleScrollEnd : undefined}
                  scrollEventThrottle={16}
                >
                  {range.map((val, index) => (
                    <TouchableOpacity
                      key={val}
                      style={styles.wheelItem}
                      activeOpacity={0.75}
                      onPress={() => {
                        lastEmittedIndexRef.current = index;
                        setWheelValue(val);
                        snapToIndex(index, true);
                      }}
                    >
                      <Text
                        style={[
                          styles.wheelText,
                          dynamicStyles.wheelText,
                          val === wheelValue && [styles.wheelTextSelected, dynamicStyles.wheelTextSelected],
                        ]}
                      >
                        {val}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.confirmBtn, dynamicStyles.confirmBtn]}
                  onPress={handleWheelConfirm}
                  accessibilityRole="button"
                  accessibilityLabel={t('training.confirm')}
                >
                  <Text style={styles.confirmText}>{t('training.confirm')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </LiquidBackground>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: 300,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
    paddingBottom: spacing.m,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.s,
  },
  backText: {
    ...typography.body,
    fontWeight: '500',
  },
  title: {
    ...typography.body,
    fontSize: 17,
    fontWeight: '600',
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.m,
    gap: 12,
    justifyContent: 'center',
  },
  optionBtn: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  optionBtnSelected: {
    // dynamic applied via style prop
  },
  optionText: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  wheelContainer: {
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.m,
  },
  scroller: {
    width: '100%',
    flex: 1,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    width: '100%',
    textAlign: 'center',
    lineHeight: ITEM_HEIGHT,
    textAlignVertical: 'center',
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
    fontSize: 20,
    fontWeight: '400',
  },
  wheelTextSelected: {
    fontSize: 22,
    fontWeight: '600',
  },
  selectionOverlay: {
    position: 'absolute',
    top: (250 - spacing.m - ITEM_HEIGHT) / 2,
    left: spacing.xl,
    right: spacing.xl,
    height: ITEM_HEIGHT,
    borderRadius: 10,
  },
  confirmBtn: {
    marginTop: spacing.m,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 20,
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});
