import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type UndoToastProps = {
  message: string;
  actionLabel: string;
  accessibilityLabel: string;
  onUndo: () => void;
  isBusy?: boolean;
  bottomOffset?: number;
  backgroundColor: string;
  textColor: string;
  actionColor: string;
};

export const UndoToast = ({
  message,
  actionLabel,
  accessibilityLabel,
  onUndo,
  isBusy = false,
  bottomOffset = 16,
  backgroundColor,
  textColor,
  actionColor,
}: UndoToastProps) => (
  <View pointerEvents="box-none" style={[styles.container, { bottom: bottomOffset }]}>
    <View style={[styles.toast, { backgroundColor }]} accessibilityLiveRegion="polite">
      <Text style={[styles.message, { color: textColor }]} numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={isBusy}
        onPress={onUndo}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        {isBusy ? (
          <ActivityIndicator color={actionColor} size="small" />
        ) : (
          <Text style={[styles.actionText, { color: actionColor }]}>{actionLabel}</Text>
        )}
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
    elevation: 20,
  },
  toast: {
    minHeight: 56,
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  action: {
    minHeight: 44,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
});
