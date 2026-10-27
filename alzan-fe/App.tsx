import React from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { PreferencesProvider } from './src/context/PreferencesContext';
import { ThemeProvider } from './src/context/ThemeContext';
import './src/i18n';

import { enableScreens } from 'react-native-screens';
import { AlzanBackendClientProvider } from './src/context/AlzanBackendClientContext';
import { AlertProvider } from './src/context/AlertContext';
import { ProviderOAuthWebCallback } from './src/modules/wearables/ProviderOAuthWebCallback';
import { shouldRetryQuery } from './src/lib/querySafety';

// Enable screens for better performance
enableScreens(true);

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });

const shouldRenderProviderOAuthWebCallback = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/oauth/');
};

export default function App() {
  if (shouldRenderProviderOAuthWebCallback()) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ProviderOAuthWebCallback />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <AlzanBackendClientProvider>
              <PreferencesProvider>
                <ThemeProvider>
                  <AlertProvider>
                    <RootNavigator />
                  </AlertProvider>
                </ThemeProvider>
              </PreferencesProvider>
            </AlzanBackendClientProvider>
          </QueryClientProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
