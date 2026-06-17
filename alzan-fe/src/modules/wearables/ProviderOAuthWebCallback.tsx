import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '../../theme';

export const ProviderOAuthWebCallback = () => {
  const { t } = useTranslation();
  const [message, setMessage] = useState(t('settings.oauthCallbackCompleting'));

  useEffect(() => {
    const showManualClose = () => setMessage(t('settings.oauthCallbackManualClose'));

    try {
      const result = WebBrowser.maybeCompleteAuthSession();
      if (result.type === 'failed') showManualClose();
    } catch {
      showManualClose();
    }

    // Best-effort: close the popup ourselves in case expo couldn't (e.g. the
    // window.opener was severed across the OAuth redirect chain). If the browser
    // refuses, fall back to the manual hint.
    const timer = setTimeout(() => {
      try {
        if (typeof window !== 'undefined') window.close();
      } catch {
        // Ignore: closing may be blocked; the manual hint covers this case.
      }
      showManualClose();
    }, 400);

    return () => clearTimeout(timer);
  }, [t]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[typography.body, styles.message]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.m,
    justifyContent: 'center',
    padding: spacing.l,
  },
  message: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
