// AlertProvider.tsx
import React, { useEffect, ReactNode } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, AlertButton } from 'react-native';
import { Alert } from '../components/common/Alert';
import { useTheme } from './ThemeContext';

interface AlertConfig {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [visible, setVisible] = React.useState(false);
  const [config, setConfig] = React.useState<AlertConfig | null>(null);
  const { colors } = useTheme();

  useEffect(() => {
    // Only set up custom alert listener on web
    if (Platform.OS === 'web') {
      Alert.setListener(alertConfig => {
        setConfig(alertConfig);
        setVisible(true);
      });
    }
  }, []);

  const handleButtonPress = (button?: AlertButton) => {
    setVisible(false);
    setTimeout(() => {
      button?.onPress?.();
    }, 100);
  };

  if (Platform.OS !== 'web') {
    // On native platforms, just render children without modal
    return <>{children}</>;
  }

  const buttons = config?.buttons || [{ text: 'OK', style: 'default' as const }];
  const handleRequestClose = () => {
    const cancelButton = buttons.find(button => button.style === 'cancel');
    if (cancelButton) {
      handleButtonPress(cancelButton);
    } else if (buttons.length === 1) {
      // A one-button success or information alert should behave the same as
      // acknowledging it when dismissed with Escape or the system back action.
      handleButtonPress(buttons[0]);
    } else {
      setVisible(false);
    }
  };

  return (
    <>
      {children}
      <Modal transparent visible={visible} animationType="fade" onRequestClose={handleRequestClose}>
        <View style={[styles.overlay, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.alertBox, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{config?.title}</Text>
            {config?.message && <Text style={[styles.message, { color: colors.textSecondary }]}>{config.message}</Text>}
            <View style={styles.buttonContainer}>
              {buttons.map((button, index) => {
                const isCancel = button.style === 'cancel';
                const isDestructive = button.style === 'destructive';

                let buttonBg = colors.primary;
                let buttonText = colors.white;

                if (isCancel) {
                  // Use disabledButton color for cancel background (usually gray)
                  buttonBg = colors.disabledButton;
                  // Text color for cancel should be primary text to be visible on light gray
                  // Or if it's dark mode, the disabledButton is dark gray, so white text is fine?
                  // Let's check:
                  // Light: disabledButton #E5E5EA (light gray), textPrimary #000. Contrast OK.
                  // Dark: disabledButton #3A3A3C (dark gray), textPrimary #FFF. Contrast OK.
                  buttonText = colors.textPrimary;
                } else if (isDestructive) {
                  buttonBg = colors.danger;
                  buttonText = colors.white;
                }

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      { backgroundColor: buttonBg },
                      index !== buttons.length - 1 && styles.buttonMargin,
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text style={[styles.buttonText, { color: buttonText, fontWeight: isCancel ? '400' : '600' }]}>
                      {button.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertBox: {
    borderRadius: 14,
    padding: 20,
    minWidth: 270,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonMargin: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: 15,
  },
});
